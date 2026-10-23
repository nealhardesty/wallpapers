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

> Status: **phases 1–5 done** (2026-10-22). The player, the stage, the
> panel and all 17 wallpapers run from `web/index.html`, as a Chrome new-tab
> extension, and on GitHub Pages at https://nealhardesty.github.io/wallpapers/.
> Next up is Phase 6, mobile readiness and then Android.

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
| `fireplace` | fireplace.js, fireplace.html | 115 KB | 4 full-screen offscreen buffers. |
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
├── android/                     # Gradle project (phase 6)
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
  Old homepage settings are not migrated automatically: the extension is a
  new identity with its own storage. The README gives a one-line console
  snippet that dumps the old keys in the panel's Import format.
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
  | Nov | fishtank |
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
  // phase 6: power { charging, level, saver, thermal } and idleUntil(ms) (§4.8)
}
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
  - `,` toggles it; `Esc` closes it; `?panel=open` opens it on load.
  - On a touch screen, a long press in the top-right corner.
  - With a mouse, a ⚙︎ gear fades in when the pointer nears that corner.
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
| `,` | everywhere | open or close the panel |
| `Esc` | everywhere | close the key help, then the panel |
| `[` / `]` | everywhere | previous or next wallpaper (remembered) |
| `←` / `→` | panel open | previous or next wallpaper |
| `F` | everywhere | fullscreen |
| `?` | everywhere | key help, listing the current wallpaper's own keys too |
| wallpaper keys | panel closed | declared in the catalog (`keys`), run inside the stage, and may answer with a toast. Quest: `N` new quest, `H` hero, `V` look, `T` hat, `M` companion, `P` palette. Advent: `←`/`→` a day (with Shift, a week), `↑`/`↓` a month, `0` today, `T` theme, `R` replay |

Keys are ignored when Ctrl, Meta or Alt is held, or when focus is in a form
field. The player's keys work wherever focus is: the stage forwards `,`
`[` `]` `f` to the player when it has focus.

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

### 4.8 Performance tiers and power budget

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

A global setting (`wp:performance`) holds the mode, with optional
per-wallpaper overrides ("Follow global" by default).

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
    wallpaper's frame callback (`performance.now()` around it), plus
    late frames.
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
    and their High / Balanced / Performance settings.

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

Built in Phase 3, with no module changes:
- **Frame pacing.** The stage replaces `requestAnimationFrame` before any
  wallpaper code loads. It enforces the tier's fps cap (the slow cap for
  `motion: 'slow'`) by skipping display ticks, pauses when hidden or told
  to, and times every frame into `host.frames` for the governor.
- **DPR cap.** It replaces the [Replaceable] `devicePixelRatio`, so the
  modules that size by it (fishtank, halloween, advent, quest) see the
  tier's cap.
- **Render scale.** The player lays the stage out at `renderScale` × the
  window and scales it up (§4.1).
- **Pinned tiers.** `?tier=`, then the saved `wp:performance` mode, then the
  host default (`WP.resolveTier`).

Still per wallpaper (phase 6):
- **`onQuality(q)`**, where `q = { tier, fps, renderScale, dpr, density,
  effects: Set, motion }`. The module scales its counts, rebuilds its
  offscreen buffers, and toggles its effects.
- **Idle frames.** A frame callback may return `false` ("nothing changed")
  or call `host.idleUntil(ms)`. The core then produces no frames, and
  Android doesn't post the surface, until there is input, a timer or the
  deadline. Advent between door animations, a sleeping neko, paused quest
  and Bing (a still image: **0 fps**) then cost almost nothing.
- **Catalog** entries declare `effects`, ordered most expensive first (the
  order the governor sheds them), alongside the existing `motion`:

  ```js
  effects: [['depthBlur', 'high'], ['caustics', 'medium'], ['godRays', 'medium'], ['glass', 'low']],
  ```

#### Techniques catalogue (applied across modules)

- **Never** call `getImageData`/`putImageData` per frame.
  - Quest's palettes become palette-swapped sprite sheets, built once when
    the palette changes.
  - Fishtank's caustics become a small (128²) caustic texture, regenerated
    at ≤ 10 fps and drawn scaled with `lighter` compositing.
- **No live `shadowBlur` or `ctx.filter`.** Bake glows into sprite caches,
  such as a matrix glyph atlas with the glow included, and advent doors.
  Get depth-of-field blur by drawing distant layers into a downscaled
  buffer and upscaling, which blurs for free.
- **Bloom** runs at 1/8 resolution on Medium and is off on Low.
- **Static layers** (backgrounds, hills, tank glass, castle) are rendered
  once per resize or tier change, never per frame.
- **Object pools** for particles, so garbage-collection pauses don't show
  up as jank.
- **Spatial grids** for O(n²) flocking (halloween's bats).

#### Per-wallpaper plan

| Wallpaper | Expensive today | Medium | Low |
|---|---|---|---|
| fishtank | `ctx.filter` depth blur, per-frame caustics `putImageData`, god rays, glass | Downscale-blur depth, caustic texture at 10 fps | No depth blur (distant fish dimmed instead), no caustics, density 0.35 |
| northern-lights | Full-resolution aurora, bloom chain, reflection | Bloom 1/8, reflection at half resolution | No bloom or reflection; slow-motion fps |
| halloween | Bloom, grain, 3 fog banks, boids | Bloom 1/8, grain off, 2 fog banks | No bloom or grain, 1 fog bank, bats ×0.35, gridded boids |
| fireplace | 4 full-screen buffers, up to 1,400 particles | Buffers at renderScale | Plus sparks ×0.35, smoke off |
| quest | Per-frame palette filter, CRT, light canvas | Palette sheets (every tier), CRT off | Light map at half resolution; 30 fps is plenty for 8-bit |
| leaves | 14k-leaf pile buffer, falling leaves | Pile cap 6k | Pile cap 2k, density |
| advent | `shadowBlur` doors, confetti | Baked door art; idle between animations | Plus less confetti |
| matrix | `shadowBlur` on every glyph | Glyph atlas with baked glow | Plus fewer columns |
| starfield, mountains, parallax-clouds | Many layers | `motion: 'slow'` | Plus density |
| snow, rain, cherry-blossoms, fireflies | Particle counts, glow | Density | Density, smaller glow sprites |
| neko | Trivial | Idle while asleep | Same |
| bing | A still image | 0 fps; redraw on resize only | Same |

#### In the panel

- A global **Performance** row: `Auto · Low · Medium · High`, a
  Battery-aware toggle, and a live readout such as
  `⚡ Medium · 30 fps · 4.1 ms/frame · on battery · rung 6/12`.
- Each thumbnail carries a cost badge (⚡ / ⚡⚡ / ⚡⚡⚡) taken from
  `make bench`, so you can see the expensive ones before you pick.
- `?hud=1` shows a small corner overlay with fps, frame ms, tier, rung and
  power state. It's for tuning; it's never on by default.

#### Measuring it

- **`make bench`:** headless Chrome driven over the DevTools protocol, with
  Node's built-in `WebSocket` and no deps.
  - Every wallpaper at every tier, for 10 s, at a phone viewport
    (412×915, dpr 2.625).
  - 4× CPU throttling (`Emulation.setCPUThrottlingRate`).
  - Records p50/p95 callback ms, effective fps and main-thread busy %
    (`Performance.getMetrics` TaskDuration).
  - Writes `bench/results.json` and prints a table.
  - **Budgets:** at 4× throttle every wallpaper must stay under 25% busy on
    Low and under 50% on Medium. A miss is a bug.
  - Not in CI, because shared runners are too noisy; it's run before
    releases and after performance work.
- **`make android-bench`** (phase 6): over `adb`.
  - Resets `dumpsys batterystats`, runs each wallpaper at each tier for
    10 minutes, then collects `dumpsys gfxinfo` and the battery stats.
  - Estimates mAh per hour per wallpaper per tier, and records the table
    in this SPEC. That's the real answer to "does Low actually save
    battery?"

#### Android specifics

- **Shrink the surface itself.** `SurfaceHolder.setFixedSize(w × s, h × s)`
  makes the wallpaper surface smaller and lets the system compositor
  upscale it in hardware. Under strategy 1 (VirtualDisplay) the WebView
  viewport shrinks with it, so every cost shrinks.
- **Copy only new frames.** Under strategy 2 (`draw()` copy), the engine
  copies only when JS reports a new frame. With idle frames this means
  zero copies while static.
- **Power signals into JS.** The engine pushes them through
  `evaluateJavascript("wp.power({...})")`; `host.power` holds the latest.
- **Frame pacing.** The native side follows `Choreographer`, at the fps cap.

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
  No `key` either: an unpacked extension's id comes from its folder, and a
  zip from the Web Store would get its own.
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

### 6.1 Rendering strategy: spike first

A `WallpaperService.Engine` hands us a bare `Surface`. A WebView is a View and
does not draw onto a bare surface by itself. Candidates, in order of
preference:

1. **VirtualDisplay → Presentation → WebView.** Create a `VirtualDisplay`
   whose output is the engine's surface, and show a `Presentation` containing
   a hardware-accelerated WebView on that display. If it works, there are no
   per-frame copies. *This is our own reasoning; no prior art was found, so it
   must be proven by the spike.*
2. **Offscreen WebView drawn into the surface.** `webView.draw(holder.lockHardwareCanvas())`,
   triggered from the page's rAF through a JS bridge. Prior art: a public
   gist from 2019 that runs p5.js sketches this way. Its comments report
   noticeable CPU cost, lower frame rates than an Activity, and WebGL
   failing. We don't use WebGL.
3. **Native port of a few wallpapers** to Kotlin Canvas. Last resort.

The spike (A0) measures CPU, frame rate and battery for fishtank (worst case)
and starfield (typical) on a real device, and picks one strategy.

### 6.2 App shape

- Kotlin, Gradle wrapper, a single module. Application ID `com.roadwaffle.wallpapers` (permanent after the first release). `minSdk 26` (Android 8), which gives `lockHardwareCanvas` for fallback strategy 2; `targetSdk` follows the current Play/AGP requirement.
- `web/` is copied into assets at build time and served through
  `WebViewAssetLoader` (`https://appassets.androidplatform.net/`), so
  `localStorage` has a stable origin.
- `index.html?host=android` (the saved wallpaper; never `w=`, so the panel's choice sticks).
- Performance and power follow §4.8: pause when invisible; Auto with a
  Medium ceiling at 30 fps; power, battery and thermal signals pushed into
  JS; the surface shrunk with `setFixedSize`.
- Touch: `setTouchEventsEnabled(true)` and forward touches to the WebView,
  so the neko cat follows a finger and taps feed the fish.

### 6.3 Settings on Android

The wallpaper's "Settings" activity is just a WebView on the same page with
the panel open (`?host=android&panel=open`). It shares `localStorage` with the
wallpaper's WebView (same app, same origin), and the engine reloads settings
on visibility. No native settings UI is needed. This is the main reason for
the data-driven schema.

### 6.4 Android-only extras (optional)

- `onOffsetsChanged` → `onScroll(x)`: mountains, parallax clouds and
  starfield pan as you swipe home-screen pages.
- `onComputeColors()` samples the canvas, so Material You picks up the
  wallpaper's palette.

### 6.5 Mobile readiness the web code needs first

- Make the per-frame stepping time-based in parallax-clouds, mountains,
  cherry-blossoms, neko and matrix.
- Use pointer events instead of mouse-only listeners in halloween, fishtank,
  neko and advent.
- Implement the tiers in every wallpaper, following the per-wallpaper plan
  in §4.8.
- Neko: load sprites in parallel (they currently load one at a time and block
  startup), or replace them entirely (§7.3).

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

- [ ] 6.1 Time-based stepping and pointer events (§6.5).
- [ ] 6.1a Tiers in every wallpaper, following the §4.8 plan and techniques (no per-frame pixel reads, baked glows, density, effects). One wallpaper per commit; the heavy ones first:
      fishtank · northern-lights · halloween · fireplace · quest · leaves · advent · matrix · starfield · mountains · parallax-clouds · snow · rain · cherry-blossoms · fireflies · neko · bing
- [ ] 6.1b `make bench`, plus the budgets. → every wallpaper is under 25% busy on Low and under 50% on Medium at 4× throttle; results committed; thumbnails get ⚡ badges.
- [ ] 6.1c Auto governor (ladder, hysteresis, per-wallpaper memory) and web power policy (`getBattery`, reduced motion); Performance row and `?hud=1`. → simulated slow frames step down within 3 s and recover without flapping (unit tests with a fake clock).
- [ ] 6.2 **Spike A0:** VirtualDisplay vs `draw()` on a real device; record the numbers here.
- [ ] 6.3 `android/` Gradle project; `make android-build`, `android-install`, `android-logcat`; assets synced from `web/`.
- [ ] 6.4 Engine: visibility pause, touch forwarding, settings activity (§6.3), power/thermal/battery bridge, `setFixedSize` render scaling, copy-only-new-frames (§4.8).
- [ ] 6.4a `make android-bench`: mAh per hour per wallpaper per tier on a real device; table recorded in §4.8.
- [ ] 6.5 Extras: home-screen scroll parallax, `WallpaperColors` (optional).
- [ ] 6.6 Distribution (decided): `make android-release` builds a signed APK; CI attaches it to a GitHub Release on tag. The keystore lives outside the repo; CI uses an encrypted secret. Play and F-Droid are not planned for now.

### Phase 7: Retire the old homepage

- [ ] 7.1 Parity check: every wallpaper, setting and key from the homepage works here. → a checklist walk-through on the extension and on Pages.
- [ ] 7.2 Owner switches Chrome to this extension and archives the private repo. Its links, weather and search are out of scope for this repo.

### Phase 8: New wallpapers

Picked by the owner from the 2026-10-22 brainstorm; each design is in §10.
Every task follows "Building a new wallpaper" in `AGENTS.md`, and is done
only when `make ci` passes, `thumb.webp` is committed, `dist/smoke/<id>.png`
and `?tier=low` and `?host=android` have been looked at, and the wallpaper is
in §2 and the README. Each task also has its own check, below. They're
ordered cheapest and offline first; the network ones come last, because
each needs fixtures and an audit allowlist entry.

- [ ] 8.0 **A clock for time-aware wallpapers.** `host.now()` returns a `Date`: the real time, or, with `?date=YYYY-MM-DD` or `?date=YYYY-MM-DDTHH:MM`, that moment ticking forward from when the stage started. Advent moves onto it. 8.3, 8.4, 8.10 and 8.12 depend on it. → unit tests: no param, a date, a date and time; advent's time travel still passes the smoke run.
- [ ] 8.1 **Harmonograph** (§10.6). → the same seed draws the same figure at 20 fps and at 120 fps (unit test on the segment generator); idle between strokes on Low.
- [ ] 8.2 **Girih** (§10.7). → every base tiling renders at every contact angle with no gaps (unit test on the strapwork generator); one full-screen redraw per morph step, none while holding.
- [ ] 8.3 **Stained Glass** (§10.8). → the glass layer is built once per resize (frame counter in the smoke run); `?date=` noon and midnight give different light.
- [ ] 8.4 **Pixel Room** (§10.9). → landscape and portrait layouts both fill the screen with integer scaling and no blurry pixels; the wall clock shows the stage's time; ≤ 12 fps on every tier.
- [ ] 8.5 **Synthwave** (§10.10). → the grid scrolls by elapsed time (same distance at 30 and 60 fps); no `shadowBlur`; every palette renders.
- [ ] 8.6 **Zen Garden** (§10.11). → the first frame is a raked garden; a scripted drag in the smoke run leaves grooves; with no input it idles between gardener strokes.
- [ ] 8.7 **Koi Pond** (§10.12). → a tap makes a ripple and the nearest koi turn towards it within 2 s; fish count follows `density`.
- [ ] 8.8 **Murmuration** (§10.13). → 3,000 birds at High, inside the §4.8 Medium budget at 4× throttle; the flock never leaves the sky for more than a few seconds; pointer falcon splits it.
- [ ] 8.9 **Lantern Festival** (§10.14). → the first frame already has lanterns in the sky; a tap releases one from the shore under the pointer; the pool never grows past its cap.
- [ ] 8.10 **Rainy Window** (§10.15). → fog regrows over a finger-drawn line within a minute; lit windows follow the hour (`?date=…T22:00` vs `T03:00`); the sharp and blurred layers are built once per resize.
- [ ] 8.11 **Night Train** (§10.16). → a tunnel and a station both appear within a 10-minute seeded run; the reflection only shows in tunnels; Low drops the glass effects and still looks deliberate.
- [ ] 8.12 **Fireworks** (§10.17). → `auto` mode never leaves the sky empty for more than its lull; a `?date=` of 31 Dec 23:59:50 counts down and fires the finale at midnight; tap mode is silent until tapped.
- [ ] 8.13 **Lighthouse** (§10.18). Adds `marine-api.open-meteo.com` to the catalog and `URL_ALLOW`. → offline and fixture runs both draw a sea; a high-swell fixture visibly raises the waves; the beam keeps its flash character at any fps.
- [ ] 8.14 **Wiki Pond** (§10.19). Adds `stream.wikimedia.org`. → a synthetic SSE fixture drives ripples in the smoke run; with the network blocked it shows the quiet offline pond, not a blank screen; the stream closes on `stop()` and while paused.
- [ ] 8.15 **Satellites** (§10.20). Needs the §10.1 `location` capability first. Adds `celestrak.org`. → the propagator stays within 1° of the published SGP4 verification vectors (§10.20) for a LEO case, seen from a test observer, up to 3 days from epoch; elements are fetched at most once per 12 h, and stale ones are labelled.

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

Several timezones, plus the local one.

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

---

## Open questions

None open. New questions go here, each with a recommendation.

---

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

