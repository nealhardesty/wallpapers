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

> Status: **planned**. All planning decisions are made (2026-10-22). The
> roadmap (§9) is the work queue; next up is Phase 1.

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
│   ├── index.html               # the player: wallpaper only, panel hidden
│   ├── manifest.json            # Chrome MV3; web/ loads unpacked as-is
│   ├── core/
│   │   ├── registry.js          # Wallpapers.register() + catalog metadata
│   │   ├── player.js            # select/start/stop, lazy loading, persistence, deep links
│   │   ├── host.js              # host adapter: insets, visibility, input, storage, scroll offset
│   │   ├── panel.js             # unified switcher + settings overlay
│   │   ├── settings.js          # renders a wallpaper's settings schema into controls
│   │   └── theme.css            # tokens (was the homepage's CSS variables)
│   ├── wallpapers/
│   │   └── <id>/                # one folder per wallpaper: scripts + its own assets
│   └── icons/
├── tools/                       # node scripts (built-ins only): tests, audit, thumbnails
├── android/                     # Gradle project (phase 6)
├── .github/workflows/ci.yml     # runs `make ci`
├── Makefile
├── README.md                    # setup and use
├── SPEC.md                      # this file
└── THIRD_PARTY.md               # provenance and licences of anything not ours
```

`web/` is the single source of truth. The Chrome extension *is* `web/`;
GitHub Pages serves `web/`; the Android build copies `web/` into its assets.
Nothing outside this repo consumes it. The old homepage is retired, not
integrated.

---

## 4. Architecture

### 4.1 Wallpaper contract

Each wallpaper registers metadata eagerly and loads its code lazily, so a new
tab only parses the 20–500 KB it needs instead of 1.7 MB.

```js
// web/wallpapers/fishtank/meta.js — tiny, always loaded
Wallpapers.register({
  id: 'fishtank',
  name: 'Fish Tank',
  icon: '🐠',
  scripts: ['wallpapers/fishtank/fishtank.js'],   // loaded on first use
  interactive: true,                              // wants pointer input
  network: false,                                 // or { hosts: ['www.bing.com'] }
  cost: 'high',                                   // hint for mobile defaults
});

// web/wallpapers/fishtank/defaults.js — every default value, and nothing else
Wallpapers.defaults('fishtank', {
  configVersion: 1,
  theme: 'planted',
  fishCount: 32,
  bubbles: true,
  // …
});

// web/wallpapers/fishtank/fishtank.js — the existing manager, wrapped
Wallpapers.implement('fishtank', host => new FishTankAnimationManager(host));
```

**Defaults live in their own file** (`defaults.js`, one per wallpaper). It
replaces today's mix of inline objects, `defaults()` methods and the
homepage's global `CONFIG`.

- It is a script, not JSON, because Chrome blocks `fetch()` of local files
  from `file://`.
- It loads lazily with the wallpaper's code.
- Saved settings are stored as **overrides only**: the keys the user
  actually changed. A retuned default then reaches everyone who never
  touched that setting.
- Reset means deleting the overrides.
- The settings schema (§4.4) holds labels and ranges; `defaults.js` holds
  values.
- A test checks that every schema key has a default, every default has a
  schema entry or is internal (`configVersion`), and every default is
  inside its range.

Instance interface (the existing managers already mostly have this shape):

| Member | Required | Meaning |
|---|---|---|
| `start()` / `stop()` | yes | Begin and end drawing. `stop()` must cancel rAF, remove its canvas and remove **every** listener. |
| `destroy()` | yes | Release everything; the instance is never reused. |
| `settings()` | yes | Returns the settings schema (§4.4) plus current values. |
| `applySettings(values)` | yes | Applies live; persists through `host.storage`. |
| `onInsets(insets)` | no | Host chrome changed size (replaces `temporaryStatusBarHeight`). |
| `onScroll(x, y)` | no | Android home-screen page offset 0..1, for parallax (§6.4). |
| `onQuality(q)` | yes | Tier or rung changed: scale counts, rebuild buffers, toggle effects (§4.8). |
| `keys` | no | Declared shortcuts `{ key, label, run }`, listed in the panel and dispatched only while the panel is closed. |

### 4.2 Player (`core/player.js`)

- Owns the current wallpaper. Switching is `stop()` → `destroy()` →
  create → `start()`, with a short crossfade. It replaces the homepage's
  hand-written `setXWallpaper()` and `stopAllAnimations()` switches.
- Persists the choice under a namespaced key (`wp:current`). Every
  wallpaper's settings live under `wp:<id>` and keep a `configVersion`.
  Old homepage settings are not migrated automatically: the extension is a
  new identity with its own storage. The README gives a one-line console
  snippet that dumps the old keys in the panel's Import format.
- Deep links (decided) replace the old per-wallpaper pages: `index.html#fishtank`
  selects a wallpaper. The `advent` page's `?date=` and `?theme=` become
  `#advent?date=2026-12-25`. No `quest.html`-style stub pages are kept.
- Pauses every wallpaper on `visibilitychange`, centrally, instead of relying
  on rAF throttling. Snow already does this in its standalone fork.
- **Seasonal** (decided) is a pseudo-wallpaper in the strip and the
  first-run default. It plays the wallpaper for the current month, using
  that wallpaper's own saved settings. It checks again at the top of every
  hour, so it rolls over on the 1st without a reload. Picking any real
  wallpaper turns Seasonal off; picking Seasonal turns it back on. The table
  lives once, in `player.js`:

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

### 4.3 Host adapter (`core/host.js`)

One object passed to every wallpaper, so the wallpapers never know where
they run:

```js
host = {
  kind: 'standalone' | 'extension' | 'android',
  insets: { top, right, bottom, left },   // px kept clear, e.g. Android nav bar; 0 elsewhere
  storage: { get(key), set(key, value) }, // localStorage today, swappable
  quality: { tier, fps, renderScale, dpr, density, effects, motion },  // §4.8, live
  power: { charging, level, saver, thermal },                          // §4.8, live
  requestFrame(cb), createCanvas(opts), idleUntil(ms),                 // §4.8
  pointer: EventTarget,                   // where interactive wallpapers listen
  reducedMotion: boolean,                 // prefers-reduced-motion
}
```

The host is detected from `location` and a `?host=` override.
`?host=android` lets a desktop browser simulate the Android host
(insets, dpr cap, touch-only) for testing.

### 4.4 Settings schema and the unified panel

The homepage has 17 hand-built modal dialogs, each with its own markup and
Save/Cancel. Halloween already generates its dialog from a data spec
(`controlSpec()`). Generalise that pattern. Every wallpaper
describes its settings as data, and `core/settings.js` renders them:

```js
settings() {
  return [
    { group: 'Water' },
    { key: 'theme', type: 'select', label: 'Water', options: [['planted', 'Planted'], …] },
    { key: 'fishCount', type: 'range', label: 'Fish', min: 4, max: 80, step: 1, help: '…' },
    { key: 'bubbles', type: 'toggle', label: 'Airstone' },
  ];
}
```

**Decided.** Payoff: one consistent look, **live preview** (changes apply as you drag, and
there is no Save/Cancel, just *Reset to defaults*), no `createInfoIcon` or CSS
variable coupling, and settings work identically on Android (§6.3).

**The panel** is one overlay that combines the switcher and the settings:

```
┌──────────────────────────────────────────────────────────────┐
│ 🗓 Seasonal  ❄️ Snow  🌧 Rain  🍂 Leaves  ✨ Fireflies  …    │  ← thumbnail strip (§4.7)
├──────────────────────────────────────────────────────────────┤
│ 🐠 Fish Tank                                    [↺ Reset]    │
│  Water ▾ Planted     Fish ━━━━●━━━ 32     Airstone [on]      │  ← schema-rendered, applies live
│  Keys: click feed · double-click tap glass · drag stir       │  ← the wallpaper's declared keys
├──────────────────────────────────────────────────────────────┤
│ , close · ←/→ switch · F fullscreen · ? help     [Export ⤓] │
└──────────────────────────────────────────────────────────────┘
```

- Hidden by default; nothing but the wallpaper shows.
- Translucent and anchored to an edge, so the live wallpaper stays visible
  behind it while you tune.
- **Open key (decided):** `,` opens and closes it, and `Esc` closes it.
  On touch screens, a long press in a corner hot zone opens it.
- While the panel is open, wallpaper shortcuts are suspended. That fixes the
  homepage's clashes (advent's Escape, `c`/`s`/`o` settings keys).
- `F` toggles fullscreen everywhere.
- Export and import of all settings as JSON. A good fit for moving tuned
  settings to the phone.

### 4.5 Keyboard map (target)

| Key | Where | Action |
|---|---|---|
| `,` | everywhere | open/close panel |
| `Esc` | panel open | close panel |
| `←` / `→` | panel open | previous/next wallpaper |
| `F` | everywhere | fullscreen |
| `?` | everywhere | key help overlay |
| wallpaper keys | panel closed | e.g. quest `N`/`H`/`V`/`T`/`M`/`P`, advent arrows/`T`/`R` |

Keys are ignored when Ctrl, Meta or Alt is held, or when focus is in a form
field.

### 4.6 Bing image of the day (decided: keep it all)

The photos load straight from `bing.com`, since plain image loads aren't
subject to CORS. Only the JSON archive API
(`HPImageArchive.aspx?format=js&idx=N&n=1`) is blocked cross-origin, so
each host gets that JSON its own way, behind one function, `host.fetchBing(idx)`:

| Host | How it gets the JSON | Third-party proxy? |
|---|---|---|
| extension | Direct fetch, allowed by `host_permissions: ["https://www.bing.com/*"]` | no |
| android | Native fetch through a JS bridge, or the asset loader intercepting the request; no CORS in native code | no |
| GitHub Pages | Same-origin `bing.json`: a scheduled GitHub Action (`make bing-json`) fetches the last 8 days daily and publishes the metadata with the site. It stores only URLs, titles and copyright text, never the images | no |
| `file://` / `make serve` | `make serve` serves a local `bing.json` built by `make bing-json`. Raw `file://` falls back to the public CORS proxies only if the user turns that on in Bing's settings, with a note saying a third party sees the request | opt-in only |

Kept from the homepage: the info overlay (title, date, link to the photo)
and the 0–7-day picker with preview. Both move into the schema and panel.
The overlay respects host insets. Offline, or when every source fails, it
falls back to `blank` and shows "Bing unavailable" in the panel.

The overlay links to `bing.com` pages, so on Android a tap opens the
browser.

### 4.7 Thumbnails (decided)

The panel strip shows a picture of each wallpaper, not just a name.

- **Static:** `make thumbnails` drives headless Chrome to run each wallpaper
  at 1280×800 with a fixed random seed, wait for it to settle (e.g. snow has
  fallen, fish are swimming), and save a 320×200 WebP to
  `web/wallpapers/<id>/thumb.webp`, about 10–20 KB each. The files are
  committed, so thumbnails work offline, on Android and from `file://`.
  - Seasonal's tile is the current month's thumbnail with a calendar badge.
  - Bing's tile is the live photo once fetched, or a placeholder.
- **Live:** the focused or hovered tile comes alive by loading
  `index.html?thumb=1#<id>` in a small iframe. Only one plays at a time, and
  thumb mode turns off input, panel and persistence. The same files run, so
  there is no second renderer to maintain. It is skipped on Android and
  under `prefers-reduced-motion`.
- The same images feed the README gallery and the Pages site's social
  preview.
- Wallpapers that need it get a `seed` option so thumbnails are
  reproducible. `make thumbnails` reports which images changed, so
  regenerating them is a deliberate commit, not CI churn.

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

#### What wallpapers implement

The contract (§4.1) gains a little, and most of it replaces boilerplate
every module already has:

- **`host.requestFrame(cb)`** replaces `requestAnimationFrame`. It enforces
  the fps cap (skips display ticks), pauses when hidden, times the callback
  for the governor, and passes a clamped `dt`. Switching to it is a
  mechanical change in each module.
- **`host.createCanvas({ alpha, pixelated })`** replaces each module's
  canvas setup. It sizes the backing store to CSS size × dpr cap ×
  renderScale, and resizes it on tier change, resize and inset change.
- **`onQuality(q)`**, where `q = { tier, fps, renderScale, dpr, density,
  effects: Set, motion }`. The module scales its counts, rebuilds its
  offscreen buffers at `renderScale`, and toggles its effects.
- **Idle frames.** A frame callback may return `false` ("nothing changed")
  or call `host.idleUntil(ms)`. The core then produces no frames, and
  Android doesn't post the surface, until there is input, a timer or the
  deadline. Advent between door animations, a sleeping neko, paused quest
  and Bing (a still image: **0 fps**) then cost almost nothing.
- **Meta** declares `effects`, ordered most expensive first (the order the
  governor sheds them), and `motion`:

  ```js
  effects: [['depthBlur', 'high'], ['caustics', 'medium'], ['godRays', 'medium'], ['glass', 'low']],
  motion: 'normal',
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
  the hosted copy on GitHub Pages (decided). CI deploys `web/` on every push
  to `master`, and a daily scheduled job refreshes `bing.json`.
- **Chrome new tab:** `web/manifest.json` (MV3) with
  `chrome_url_overrides.newtab = index.html`, permission `storage`, and one
  host permission, `https://www.bing.com/*` (§4.6). It is a new extension identity with a freshly
  generated key, not the homepage's. `make extension` zips `web/` into
  `dist/`.
  - Known Chrome behaviour: a new tab puts keyboard focus in the omnibox,
    so `,` only works after a click on the page. This is documented in the
    README, and the corner hot zone works with a mouse too.
- **Homepage-as-URL alternative:** point Chrome's "Open a specific page" at
  the hosted URL. No extension needed, but the page doesn't replace the new tab.

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
- `index.html?host=android#<id>`.
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
| Neko sprites (79 themes, 20 MB) | Copied from an MIT repo, but that repo doesn't credit the sprites; they trace back to decades of Neko skin packs by many authors. Several themes are trademarked characters (Sonic, Pac-Man, Metroid, Zelda, Doom, TIE fighter, Coke). Filenames have inconsistent case (`Awake.ico` vs `awake.ico`): 78 of 79 themes break on case-sensitive hosts such as Android and Linux. | **Decided: redraw.** Neko becomes code-drawn pixel art with coat variants, drawn the way Pixel Quest draws its cats, keeping the classic oneko behaviours (chase, yawn, scratch, wash, sleep, wall claws). This drops 20 MB and every provenance question. None of the old sprites are imported. |
| Snow sprites (`tannenbaum.png`, `snow00–06.png`) | Look like xsnow's art. xsnow is GPL-3+ (older versions non-free). Provenance unverified. | Delete. snow.js already has a canvas fallback; make it the only path and improve it. |
| Pixel Quest text | Affectionate parodies ("IT'S A SECRET TO EVERYBODY", Lonk, Zelderp). | Keep; parody is low risk. Note it in THIRD_PARTY.md. |
| Fonts | System fonts only (`ui-rounded`, Courier New, emoji). | Nothing to ship. |

---

## 8. Testing

- `make test`: a Node script drives headless Chrome (the homepage's
  fixture approach, with no npm deps). For every wallpaper at 360, 800 and
  1440 px it checks that:
  - the wallpaper starts and draws non-blank pixels within 2 s
  - there are no console errors
  - `stop()` leaves no canvas, no rAF and no listeners
  - the panel opens with `,` and every schema control round-trips through
    storage
- `make lint`: `node --check` on every script, plus a check that no wallpaper
  leaks globals beyond its registration.
- `make audit`: §7.2.
- `make ci` = lint + audit + test; GitHub Actions runs only this.
- `make bench`: performance budgets per wallpaper per tier (§4.8). Manual,
  not in CI.
- `make thumbnails`: regenerates the committed thumbnails (§4.7). Not part
  of `make ci`; the tests only check that every wallpaper has one.

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

- [ ] 2.1 Copy the 16 wallpaper modules and the Bing parts of wallpaper.js into `web/wallpapers/<id>/`; nothing else. → `make audit` passes.
- [ ] 2.2 Diff the snow.html and leaves.html forks against their modules; merge any improvements (e.g. snow's visibility pause); drop the forks.
- [ ] 2.3 Don't import the snow PNGs; make the canvas drawing the only path. Import neko.js **without** `assets/neko/`; it stays disabled until 4.6.
- [ ] 2.4 THIRD_PARTY.md. LICENSE stays MIT.
- [ ] 2.5 Commit. → each wallpaper runs in a throwaway harness page with no errors.

### Phase 3: Core

- [ ] 3.1 `registry.js`, `player.js`, `host.js`, `theme.css`; lazy script loading. → the player switches between all wallpapers with no leaked canvases or listeners (test).
- [ ] 3.2 Wrap each module (no leaked globals); give every module the same lifecycle (`start`/`stop`/`destroy`).
- [ ] 3.3 Replace `statusBarHeight` and `temporaryStatusBarHeight` with host insets.
- [ ] 3.4 Decouple snow from `CONFIG` and `homepageApp`; move its settings in; fix the `WindSystem` swap bug.
- [ ] 3.5 Fix the cherry-blossoms resize-listener leak; centralise the visibility pause.
- [ ] 3.6 Deep links (`#id`, `#advent?date=`) and namespaced `wp:` storage.
- [ ] 3.7 Seasonal pseudo-wallpaper (§4.2). → unit test over all 12 months and a rollover at midnight on the 1st with a faked clock.
- [ ] 3.8 Extract every wallpaper's defaults into `defaults.js` (§4.1); store user settings as overrides only. → the defaults/schema consistency test passes for all wallpapers.
- [ ] 3.9 `core/perf.js`: `host.requestFrame`, `host.createCanvas`, `onQuality`, idle frames, pinned tiers (no governor yet); switch every module's rAF and canvas setup over. → the fps cap and renderScale visibly apply to all wallpapers; a hidden tab uses zero frames (test).

### Phase 4: The panel

- [ ] 4.1 `settings.js` schema renderer: range, select, toggle, color, group, help.
- [ ] 4.2 Migrate settings to the schema, one wallpaper per commit (halloween first, as it is nearly there). 16 checkboxes:
      snow · rain · leaves · fireflies · fireplace · northern-lights · parallax-clouds · mountains · starfield · cherry-blossoms · halloween · neko · matrix · fishtank · advent · quest
- [ ] 4.3 `panel.js`: switcher strip, settings pane, live apply, Reset, keys list, Export/Import.
- [ ] 4.4 Key map (§4.5), key help overlay, touch corner hot zone.
- [ ] 4.5 Quest and advent standalone keys become declared `keys`. → `index.html#quest` plays like `quest.html` did.
- [ ] 4.6 Redraw neko: code-drawn sprite bank (8 directions × 2 frames, idle, yawn, scratch, wash, sleep, 4 wall claws), coat variants, pointer events so it follows a finger. → visual check against the classic oneko behaviours; zero image files.
- [ ] 4.7 Bing: `host.fetchBing()` per host, overlay and day picker in the panel, offline fallback. → test with a fixture `bing.json` and a failing fetch.
- [ ] 4.8 Thumbnails (§4.7): seeds where needed, `make thumbnails`, committed WebPs, live preview iframe for the focused tile. → the strip shows 18 tiles (16 + Seasonal + Bing) offline.

### Phase 5: Chrome and hosting

- [ ] 5.1 `web/manifest.json`, new icon (ours, drawn by us), `make extension` → `dist/wallpapers-extension.zip`. → loads unpacked; the new tab shows the wallpaper only.
- [ ] 5.2 GitHub Pages deploy of `web/` from CI, plus the daily `bing.json` Action. → the public URL loads; Bing works with no proxy.
- [ ] 5.3 README: install, use, keys, screenshots.

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

### Later, maybe

- Shuffle/playlist: rotate wallpapers every N minutes.
- `prefers-reduced-motion`: slow, calm defaults.
- New wallpapers, since this repo is now their home. Planned: a **weather
  forecast** wallpaper (network; a keyless API; location from geolocation
  or a typed city, kept only in local storage).

---

## Open questions

None open. Every question in the planning round was answered and folded in above.
New questions go here, each with a recommendation.
