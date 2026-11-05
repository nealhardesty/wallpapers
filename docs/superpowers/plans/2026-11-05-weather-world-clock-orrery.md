# Weather, World Clock and Orrery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new wallpapers, each flexible, configurable and a showpiece: **Weather** (`weather`, a live
Open-Meteo forecast with a sky that matches outside and a tiny animated scene on every day or hour), **World
Clock** (`world-clock`, a world map with the real day/night terminator and your cities, or analog faces, or a
departures board), and **Orrery** (`orrery`, the solar system as it is right now, computed in code, in three
looks from deep space to a brass machine, with time-lapse).

**Architecture:** Each wallpaper follows the contract in AGENTS.md "Building a new wallpaper" and SPEC §4:
its own folder under `web/wallpapers/<id>/`, a manager class, `defaults.js`, `settings.js`, a catalog entry,
a thumbnail, smoke `STAGE_CHECKS`, and pure logic split into its own file with a `tools/<id>.test.mjs`
(node `--test`, the way `tools/satellites.test.mjs` / `lighthouse.test.mjs` load a wallpaper's math file).
Each wallpaper is two tasks: the pure logic with tests first, then the wallpaper that draws it.

**Tech Stack:** Plain ES2020 classic scripts, Canvas 2D, no bundler, no deps (SPEC §1). Node built-ins for
tools and tests; headless Chrome for smoke and thumbnails.

**Spec:** `SPEC.md` §4 (contract, host, settings, keys, thumbnails, performance), §4.9 (the clock overlay's
zone helpers), §10.1 (location), §10.2 (Weather), §10.3 (World Clock), §10.5 (the orrery suggestion);
`AGENTS.md` (the build checklist, public-repo rules, cheap-by-default rules, verify steps).

## Global Constraints

- AGENTS.md's "Building a new wallpaper" checklist is binding for every wallpaper, item by item (files,
  catalog, manager rules, public-repo rules, cheap-by-default, verify, docs).
- **Public repo:** no API keys; no real locations, personal names or personal details in code, docs, tests
  or fixtures. Fixtures use made-up coordinates (`0.0, 0.0` style or "Fixtureville"), never a real
  person's place. Famous world cities as *world clock choices* are public facts and allowed (SPEC §10.3 lists
  New York, London, Tokyo as defaults). Also: no `C:\Users\…`-style home paths, no emails, no runs of 32+
  hex characters (`make audit` and `make audit-history` reject them, even in examples).
- **Network:** only Weather uses it. Hosts exactly `api.open-meteo.com` (forecast) and
  `geocoding-api.open-meteo.com` (already used by the shared location panel). Declared in the catalog's
  `network`, in `URL_ALLOW` in `tools/audit.mjs`, and in `host_permissions` in `web/manifest.json` (tests
  check all three agree). `offline: true` with a real scene offline. Attribution
  "Weather data by Open-Meteo.com" visible (CC BY 4.0), and a line in `THIRD_PARTY.md`.
- **Time** always from `host.now()`, never `new Date()` (so `?date=` tests it). Animate only with rAF, by
  elapsed time, dt clamped at 100 ms; idle with `host.idleUntil(ms)` when nothing changes.
- **Cheap by default** (SPEC §4.8): no per-frame `getImageData`/`putImageData`, `shadowBlur` or `ctx.filter`;
  cache static layers; pool particles; bake glows into sprites; read `host.quality` (multiply counts by
  `density`, honour `effects`), implement `onQuality`; size canvases by `devicePixelRatio`. Check `?tier=low`
  and `?hud=1`, and `node tools/bench.mjs <id>`: **under 25% busy on Low and 50% on Medium**. Target for all
  three: `cost: 'low'`.
- **Settings:** every default has a control and every control a default, on the slider's step grid; groups
  with `advanced: true` for the rest; `applySettings(config)` takes changes live where it can.
- **Keys** are declared in the catalog `keys` and must not clash with the player's own keys (SPEC §4.5:
  the player owns `,` `c` `[` `]` `f` `k` `?` `Esc` and `←`/`→` with the panel open; no wallpaper may declare `c` or `k`).
- Ground and text stay above `host.insets.bottom` (the Windows taskbar, Android's gesture bar).
- **Interactivity** goes through `host.gestures({ tap, start, move, end })`, with a setting to ignore touch.
- **Docs per wallpaper:** SPEC §2's list and the README's list, plus an *As built* note under its §10 idea.
- `make ci` (`CHROME_PATH=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome make ci`) passes after
  every task. Look at `dist/smoke/<id>.png` and the thumbnail.
- Commit trailer: `Co-Authored-By: <the committing model> <noreply@anthropic.com>`.

## Review Focus

1. **Weather with no location, no network, or a bad answer** (first run, offline, a 5xx, a JSON that isn't
   a forecast, a place in the far north with no sunset) → it always draws a real sky and a clearly labelled
   state ("Set a place in settings", "Showing the forecast from 3 h ago", "Sample forecast"), never a blank
   or a spinner (Task 1 `normalize` tests; Task 2 smoke checks for each state).
2. **Time zones that don't divide by an hour, DST edges and the date line** (Kolkata +5:30, Kathmandu +5:45,
   Chatham +12:45, Lord Howe's 30-minute DST; a city whose date is tomorrow) → the right local time, the
   right day label ("Tomorrow"/"Yesterday" or the weekday), sorted correctly (Task 3 tests).
3. **The terminator at the solstices and the poles** (midnight sun, polar night, the equinox's straight
   line) → no gaps, no inverted night, no NaN at the poles (Task 3 tests at fixed instants).
4. **Planet positions far from now** (time-lapse to 1900 or 2100, outside the Standish table's 1800–2050
   range) → clamped or flagged honestly, never NaN, and a test pins at least two real events to within the
   method's accuracy (Task 5).
5. **Narrow and tall screens, a phone, a 4K monitor, a Windows taskbar inset** → the layout reflows (cards
   wrap or the ribbon scrolls, faces form a sensible grid, the orrery fits the short side) and nothing sits
   under `host.insets.bottom` (smoke at a phone size and with `?insets=`, Tasks 2, 4, 6).

---

### Task 1: Weather — the data (pure logic, tests)

**Files:**
- Create: `web/wallpapers/weather/weather-data.js` (a global `WeatherData` object, loadable in the stage and in node like `satellites/sgp4.js`)
- Test: `tools/weather.test.mjs`

**Interfaces — Produces (all pure, no DOM, no network):**
- `WeatherData.request({ lat, lon, days, units })` → the forecast URL string. Host `https://api.open-meteo.com/v1/forecast`. Coordinates rounded to 0.1° (SPEC §10.1) and written with one decimal. `timezone=auto`. `forecast_days` = `clamp(days, 1, 16)` but at least 2 (the hourly view needs tomorrow's early hours). `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation`; `hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m`; `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max`. `units` `'imperial'` adds `temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`; `'metric'` adds `wind_speed_unit=kmh` and nothing else.
- `WeatherData.unitsFor(locale)` → `'imperial'` for regions US, LR, MM (and `en-US` with no region → US), else `'metric'`.
- `WeatherData.normalize(json, fetchedAt)` → `{ fetchedAt, utcOffsetSeconds, timezone, current: {...}, hours: [...], days: [...] }` with plain numbers and ISO strings, or `null` for anything that isn't a forecast (missing arrays, mismatched lengths, non-numbers). Never throws.
- `WeatherData.kind(code, isDay)` → one of `'clear' | 'mostly-clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'heavy-rain' | 'freezing-rain' | 'snow' | 'heavy-snow' | 'showers' | 'snow-showers' | 'thunder' | 'hail'` per WMO (0 clear; 1 mostly-clear; 2 partly-cloudy; 3 cloudy; 45, 48 fog; 51, 53, 55 drizzle; 56, 57, 66, 67 freezing-rain; 61, 63 rain; 65 heavy-rain; 71, 73 snow; 75, 77 heavy-snow; 80, 81 showers; 82 heavy-rain; 85, 86 snow-showers; 95 thunder; 96, 99 hail), and `'cloudy'` for an unknown code. `WeatherData.label(kind)` → a short English label ("Partly cloudy").
- `WeatherData.sky(now, day)` → `{ phase: 'night'|'dawn'|'day'|'dusk', t }` from `now` against that day's sunrise/sunset (±40 min twilight), handling a missing sunrise/sunset (polar day/night: `day` when `is_day` says so, else `night`).
- `WeatherData.age(fetchedAt, now)` → `''` under 10 min, else "updated 25 min ago" / "updated 3 h ago" / "updated 2 days ago".
- `WeatherData.dayLabel(isoDate, todayIso, locale)` → "Today", "Tomorrow", else the short weekday in that locale.
- `WeatherData.sample(now)` → a deterministic, made-up 16-day forecast (normalized shape, flagged `sample: true`) covering every kind at least once, for first run before a place is set and for thumbnails.

- [ ] **Step 1: Write the failing tests** in `tools/weather.test.mjs`: the exact URL for `{ lat: 12.345, lon: -0.051, days: 5, units: 'imperial' }` (coordinates `12.3` and `-0.1`, `forecast_days=5`, the three unit params, all fields in the order above); `days: 1` → `forecast_days=2`, `days: 40` → `16`; `unitsFor` for `en-US`, `en`, `es-US`, `my-MM`, `en-GB`, `de-DE`, `fr-CA`; `normalize` of a small fixture (2 days × 48 hours, written in the test, made-up place) round-trips the fields; `normalize` of `null`, `{}`, `{"hourly":{"time":[1]}}`, mismatched hourly lengths and a string temperature → `null`; every WMO code in the table maps as listed, plus `42` → `cloudy`; `sky` at noon → `day`, 20 min before sunrise → `dawn`, with no sunrise and `is_day: 1` → `day`; `age` at 5 min, 25 min, 3 h, 50 h; `dayLabel` for today, tomorrow, and a weekday in `en-US` and `de-DE`; `sample(now)` normalizes (passes the same validation `normalize` applies) and contains every kind.
- [ ] **Step 2: Run** `node --test tools/weather.test.mjs` → fails (no file).
- [ ] **Step 3: Implement** `weather-data.js` to make them pass. Keep it free of `Date.now()`/`new Date()` without an argument.
- [ ] **Step 4: Run** `node --test tools/weather.test.mjs` → pass; `make test lint audit` pass.
- [ ] **Step 5: Commit** — `Weather: forecast request, normalize, WMO kinds, sky phase, sample forecast (tests)`

---

### Task 2: Weather — the wallpaper

**Files:**
- Create: `web/wallpapers/weather/weather.js` (`WeatherAnimationManager`), `weather-scenes.js` (the animated icon scenes and the full-screen sky/ambient layer, if `weather.js` would pass ~600 lines), `defaults.js`, `settings.js`, `thumb.webp`
- Modify: `web/wallpapers/catalog.js`, `tools/audit.mjs` (`URL_ALLOW`), `web/manifest.json` (`host_permissions`), `tools/smoke.mjs` (fixture route + `STAGE_CHECKS`), `tools/thumbnails.mjs` (settle/preset if needed), `THIRD_PARTY.md`, `SPEC.md` (§2, §10.2 *As built*), `README.md` (the list)

**Interfaces — Consumes:** Task 1's `WeatherData`; `host.storage`, `host.now()`, `host.location`/the `wp:location` capability exactly as Satellites/Lighthouse use it (`needs: ['location']`), `host.panel(feed)` + `status` extras for the panel's state line, `host.toast`, `host.gestures`, `host.idleUntil`, `host.quality`, `host.insets`.

**Catalog:** `{ id: 'weather', name: 'Weather', icon: '🌦️', accent: '#8fc8ff', background: '#0b1a2e', scripts: ['weather/weather-data.js', 'weather/weather-scenes.js', 'weather/weather.js'], make: host => new WeatherAnimationManager(host), cost: 'low', motion: 'slow', interactive: true, network: ['api.open-meteo.com', 'geocoding-api.open-meteo.com'], offline: true, needs: ['location'], keys: [...] }`.

**What it shows (the design — implement all of it):**
- **The sky is the weather outside.** A full-screen cached gradient for the current `sky()` phase and kind (clear blue day, golden dawn/dusk, deep night with stars and the moon, grey overcast, fog bank), crossfading when either changes. Over it, an **ambient layer** of the current conditions drawn in code: drifting cloud sprites, rain streaks or snowflakes (pooled, `density`-scaled), a lightning flash now and then for thunder, fog sheets, heat shimmer never (no filters). Setting `ambient`: `off | subtle | full` (default `subtle`).
- **Three views** (setting `view`, key `v` cycles): `days` — a row of day cards (`days` 3–10, default 5), each with the day label, a looping mini scene for that day's kind, high/low, precipitation chance as a small bar, and optional extras; cards wrap into two rows on narrow screens. `hours` — a 24-hour ribbon starting at the current hour: a smooth temperature curve with dots and labels every 3 hours, precipitation chance bars underneath, a mini scene per 3 hours, day/night shading behind the hours using `is_day`, sunrise/sunset markers. `now` — the current conditions large (big temperature, feels-like, kind label, a large animated scene, wind arrow and speed, humidity), with a compact strip of the next days below.
- **Tap a day card** (in `days`) → that day's hours as the ribbon, with a "back" tap anywhere outside; this is the wallpaper's interaction (setting `touch` to ignore).
- **The mini scenes** (one function per kind, drawn into a square at any size, animated by time, cached sprites for the sun/moon/cloud shapes): sun with slowly turning rays; moon with a soft glow and twinkling stars for night hours; clouds drifting across; rain falling and splashing; drizzle as fine streaks; freezing rain with ice ticks; snow falling and settling; a lightning bolt flickering out of a dark cloud; hail bouncing; fog bands sliding. Night versions for the clear/partly-cloudy kinds in the hourly view.
- **Card style** (setting `card`): `glass` (frosted panel: a translucent fill and a 1 px highlight, no blur filter), `solid`, `minimal` (no panel, text with a soft baked shadow sprite). **Placement** (`position`: `center | bottom | top`) and **size** (`scale` 0.6–1.6, step 0.05, default 1).
- **Units** (`units`: `auto | metric | imperial`; auto = `unitsFor(navigator.language)`), **time format** (`hour12`: `auto | 12 | 24`), extras toggles (`showFeels`, `showWind`, `showHumidity`, `showUv`, `showSun` (sunrise/sunset times), `showPrecipAmount`), `showPlace` (the place name from `wp:location`, default on), `showUpdated` (the "updated … ago" line, default on).
- **Refresh** every `refreshMinutes` (15 | 30 | 60, default 30) while visible; on resume after a pause longer than that, refresh once. Cache the last good forecast in `host.storage` with its place; a cached forecast for a *different* place is not shown.
- **States, never blank:** no place set → the `sample` forecast with a banner "Sample forecast · set a place in ⚙︎ settings" (and the panel's status line says so); fetching for the first time → the sample, dimmed, with "Getting the forecast…"; offline or an error with a cached forecast → the cache with "updated 3 h ago · offline"; error with no cache → the sample with "Couldn't reach Open-Meteo". The attribution "Weather data by Open-Meteo.com" is always in a corner, small.
- **Idle:** between animation ticks the scenes run at a calm rate (draw at ≤ 20 fps by idling with `host.idleUntil` between frames; `ambient: off` and `motion: reduce` → redraw once a minute).
- **Keys:** `v` next view, `u` switch units (toast says which), `r` refresh now (toast "Refreshing…", rate-limited to once a minute). Check they don't clash with SPEC §4.5.

- [ ] **Step 1:** Catalog entry, `defaults.js`, `settings.js` (groups: 🌦️ Forecast (view, days, units, hour12), 🎨 Look (ambient, card, position, scale), ℹ️ Details (the show… toggles), ⚙️ Advanced (refreshMinutes, touch)), the three allowlists, `THIRD_PARTY.md`. Run `make test` → the schema/defaults/allowlist tests pass.
- [ ] **Step 2:** The manager: canvas, layout per view, the sky and ambient layer, cards/ribbon/now, scenes, fetch + cache + states, refresh timer, `onPause`/`onResume`, `applySettings`, `onQuality`, gestures, keys.
- [ ] **Step 3:** `tools/smoke.mjs`: route `https://api.open-meteo.com/v1/forecast?` to a made-up fixture forecast (a function like `marineJson`, every kind across the days) when `current.network`; `STAGE_CHECKS.weather` proving: it draws with the fixture (non-blank, the "updated" line absent); with network off and no cache it draws the sample with its banner; after one good load then offline, a reload shows the cache with "offline"; each view renders (`v` three times); a phone-sized viewport wraps the cards and keeps text above `insets.bottom`; `?date=` at night gives the night sky. Run `node tools/smoke.mjs weather`.
- [ ] **Step 4:** `make thumbnails` (a preset in `tools/thumbnails.mjs` if the sample/fixture should show a nice mix), look at `dist/smoke/weather.png` and the thumbnail; `?tier=low`, `?hud=1`, `node tools/bench.mjs weather` (under 25% Low / 50% Medium; record the numbers in SPEC §4.8's table if other wallpapers are recorded there).
- [ ] **Step 5:** Docs: SPEC §2 list, §10.2 *As built*; README list. `make ci` passes.
- [ ] **Step 6: Commit** — `Weather: a live forecast with the sky outside, three views and animated scenes`

---

### Task 3: World Clock — the data (land, cities, sun, zones; tests)

**Files:**
- Create: `tools/world-land.mjs` (a one-off generator, wrapped as `make world-land`, that turns Natural Earth's public-domain 1:110m land polygons into `web/wallpapers/world-clock/world-land.js`), `web/wallpapers/world-clock/world-land.js` (generated, committed, **≤ 50 KB**), `web/wallpapers/world-clock/world-cities.js`, `web/wallpapers/world-clock/world-clock-math.js` (global `WorldClockMath`)
- Modify: `Makefile` (target `world-land` with a `##` description), `THIRD_PARTY.md` (Natural Earth, public domain), README Development (the new target)
- Test: `tools/world-clock.test.mjs`

**Interfaces — Produces:**
- `WORLD_LAND`: polygons as arrays of `[lon, lat]` pairs at ≤ 0.1° precision (delta-encoded or quantized as the generator sees fit, decoded by `WorldClockMath.land()` once), simplified (Douglas–Peucker) to fit 50 KB. The generator downloads `ne_110m_land` GeoJSON from Natural Earth's public repository at run time (the URL lives only in the tool; the tool is not part of the web app, so `URL_ALLOW` gets it only if the audit requires it for `tools/`), or reads a path given as an argument; it is deterministic.
- `WORLD_CITIES`: ~120 well-known cities, each `{ id, name, country, zone (IANA), lat, lon }` (public geography; ids lowercase-hyphenated), covering every inhabited UTC offset including +5:30, +5:45, +8:45, +9:30, +10:30, +12:45, +13, +14, −3:30, −9:30.
- `WorldClockMath.subsolar(date)` → `{ lat, lon }` (NOAA/Meeus low-precision: declination and equation of time, good to ~0.1°).
- `WorldClockMath.sunAltitude(lat, lon, date)` → degrees.
- `WorldClockMath.terminator(date, steps)` → the night polygon(s) for an equirectangular map as `[lon, lat]` rings, correct at the equinox (a near-vertical band) and the solstices (polar day/night caps), no NaN at ±90°; plus `twilight(date, depth)` for −6°, −12°, −18° bands.
- `WorldClockMath.zoneTime(date, zone, locale, { hour12, seconds })` → `{ text, hours, minutes, seconds, offsetMinutes, abbreviation, dayDelta }` where `dayDelta` is −1/0/+1 against the *local* date; reuse `web/core/clockface.js`'s zone helpers (`C.parts`, `C.offsetMinutes`, `C.abbreviation`, `C.validZone`) if they can be loaded in the stage (load `../core/clockface.js` from the catalog scripts if the stage allows it; otherwise copy only what's needed and say so in the report).
- `WorldClockMath.offsetLabel(minutes)` → `UTC+5:30`, `UTC−3:30` (true minus sign), `UTC`.
- `WorldClockMath.isNight(lat, lon, date)`.

- [ ] **Step 1: Write the failing tests**: `subsolar` at 2026-03-20 14:46 UTC (the March equinox) has `|lat| < 0.5`; at 2026-06-21 08:24 UTC `lat ≈ 23.44 ± 0.3`; at 2026-12-21 20:50 UTC `≈ −23.44 ± 0.3`; at 12:00 UTC on 2026-11-05 `lon ≈ −4 ± 1` (equation of time +16 min); `sunAltitude` positive at noon at the subsolar point, negative at its antipode; the terminator at the June solstice leaves the north pole in day (`isNight(89.9, 0, …) === false`) and the south pole in night, at the equinox both poles are within a degree of the line; every coordinate of every ring is finite; `zoneTime` for `Asia/Kolkata`, `Asia/Kathmandu`, `Pacific/Chatham`, `Australia/Lord_Howe` (a date in its 30-minute DST) at a fixed instant gives the right `offsetMinutes` (330, 345, 765/825, 630/660); `dayDelta` +1 for `Pacific/Kiritimati` at 2026-11-05 20:00 UTC against `local` = `America/Los_Angeles` (pass the local zone explicitly so the test doesn't depend on the machine); `offsetLabel(-210) === 'UTC−3:30'`; every city's `zone` is valid in node's Intl and its lat/lon in range; `WORLD_LAND` decodes to ≥ 100 rings, all finite, and the file is ≤ 50 KB.
- [ ] **Step 2: Run** `node --test tools/world-clock.test.mjs` → fails.
- [ ] **Step 3: Implement** the generator (run it: `make world-land`), the cities, the math.
- [ ] **Step 4: Run** the test file → pass; `make test lint audit` pass.
- [ ] **Step 5: Commit** — `World Clock: Natural Earth land, cities, the sun's position and the terminator (tests)`

---

### Task 4: World Clock — the wallpaper

**Files:**
- Create: `web/wallpapers/world-clock/world-clock.js` (`WorldClockAnimationManager`; split views into `world-clock-map.js`, `world-clock-faces.js`, `world-clock-board.js` if large), `defaults.js`, `settings.js`, `thumb.webp`
- Modify: `web/wallpapers/catalog.js`, `tools/smoke.mjs` (`STAGE_CHECKS`), `tools/thumbnails.mjs` (if needed), `SPEC.md` (§2, §10.3 *As built*), `README.md`

**Catalog:** `{ id: 'world-clock', name: 'World Clock', icon: '🌍', accent: '#ffd479', background: '#06101c', scripts: [...], make: host => new WorldClockAnimationManager(host), cost: 'low', motion: 'slow', interactive: true, keys: [...] }`. No network.

**What it shows (implement all of it):**
- **Three views** (`view`, key `v`):
  - `map` (default): the world in equirectangular projection, centred on `center` (`local` = the local zone's city longitude, else `0`, `pacific` = 150°, or any city), filling the width; letterboxed into a starfield above and below on tall screens. The land from `WORLD_LAND`, the night side from the terminator with soft twilight bands (−6/−12/−18°), a glowing sun marker at the subsolar point, optional moon marker (`showMoon`) at the sub-lunar point with its phase, optional graticule and tropics, optional **city lights**: the night side's land faintly warm-sprinkled (a cached, seeded speckle masked by land and night — baked when the terminator layer is rebuilt). Each chosen city is a dot with a label card: name, time (big), weekday when it differs from local ("Thu"), offset, and a ☀/☾ glyph; label placement avoids overlaps (a simple greedy layout with leader lines). The home (local) city is highlighted. The terminator layer is rebuilt once a minute; the clocks redraw once a second; idle in between.
  - `faces`: a grid of analog faces (one per city, auto columns by aspect), each face's dial tinted by that city's daylight (sky gradient from the sun's altitude there), with hour/minute/second hands (`seconds` toggle), the city name, a digital readout, and the day delta. Face style (`faceStyle`): `classic | modern | minimal`.
  - `board`: a split-flap departures board: rows of city · local time · offset · day/night, with flaps that flip when a digit changes (a short, cheap animation once a minute, every second if `seconds`).
- **Cities** (`cities`: a `multi` over `WORLD_CITIES`, default `local` plus `utc`, `new-york`, `london`, `tokyo`; include a pseudo-city `local` "Here" from the device zone and `utc` "UTC"), **custom zones** (`custom`: a `text` field of `Label=Area/City` pairs separated by commas, validated; bad ones listed in the panel status), `sort` (`list | east-west | offset`), `hour12` (`auto | 12 | 24`), `seconds`, `showDate`, `showOffset`.
- **Map look** (`mapStyle`): `night-lights` (dark navy seas, charcoal land, warm city lights; default), `atlas` (pale blue sea, sand/green land, soft shading), `blueprint` (cyan lines on blue), `paper` (sepia, ink outlines); `twilight` (`sharp | soft`), `showGrid`, `showSun`, `showMoon`, `cityLights`.
- **Tap** a city label → it becomes the highlighted "home" for the session and the map recentres smoothly (setting `touch` to ignore). Key `m` cycles the map's centre (`c` is the player's); key `v` the view.
- `?date=` controls everything (time from `host.now()`), so smoke can pin solstices.

- [ ] **Step 1:** Catalog, `defaults.js`, `settings.js` (🌍 Cities, 🗺️ Map, 🕰️ Faces & Board, ⚙️ Advanced). `make test` passes.
- [ ] **Step 2:** The manager and the three views, layers cached (land per resize and style; terminator per minute; faces' dials per resize), idle between seconds, `applySettings`, `onQuality` (city lights and twilight bands are `effects` at `medium`), gestures, keys.
- [ ] **Step 3:** `STAGE_CHECKS['world-clock']`: draws on every view; at `?date=2026-06-21T12:00:00Z` the pixel at the far north of the map is lit and the far south dark (read in smoke, not in the wallpaper); at the March equinox the night band's edges are near-vertical; a custom `Fixture=Asia/Kathmandu` shows `UTC+5:45`; a bad custom zone shows in the panel's status; phone size and `?insets=` keep labels above the inset; it idles (frames per second near 1 while still, via `?hud=1` or the stage's frame counter).
- [ ] **Step 4:** Thumbnail, look at `dist/smoke/world-clock.png`; `?tier=low`; bench under budget.
- [ ] **Step 5:** Docs (SPEC §2, §10.3 *As built*, README). `make ci` passes.
- [ ] **Step 6: Commit** — `World Clock: the world with the real day and night, faces and a departures board`

---

### Task 5: Orrery — the sky's mechanics (tests)

**Files:**
- Create: `web/wallpapers/orrery/orrery-math.js` (global `OrreryMath`)
- Modify: `THIRD_PARTY.md` (cite E. M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets", JPL — the public tables used — and Meeus-style Moon and Galilean-moon terms if used)
- Test: `tools/orrery.test.mjs`

**Interfaces — Produces:**
- `OrreryMath.PLANETS`: the eight planets (+ `pluto` as an optional ninth) with Standish's 1800–2050 elements and rates (a, e, I, L, ϖ, Ω and their per-century rates; the extra b, c, s, f terms for Jupiter–Pluto from the 3000 BC–3000 AD table where needed), radius (km), colour, ring flag, sidereal period (days), and a name.
- `OrreryMath.julian(date)` → JD; `OrreryMath.centuries(date)` → T from J2000.
- `OrreryMath.heliocentric(id, date)` → `{ x, y, z }` in AU, J2000 ecliptic, by solving Kepler's equation (Newton, |ΔE| < 1e-8, ≤ 30 iterations, works for e up to 0.25); `OrreryMath.inRange(date)` → true within 1800–2050 (outside, positions still computed but the wallpaper shows "approximate" honestly).
- `OrreryMath.geocentric(id, date)` → ecliptic longitude/latitude and distance from Earth; `elongation`, `isRetrograde(id, date)` (geocentric longitude decreasing over a day).
- `OrreryMath.moon(date)` → the Moon's geocentric ecliptic position (a truncated Meeus series, ~0.3°) and `phase` 0–1 with illuminated fraction.
- `OrreryMath.galilean(date)` → Io, Europa, Ganymede, Callisto angular positions around Jupiter (simple circular orbits with periods 1.769, 3.551, 7.155, 16.689 days and a known epoch phase; good enough to look right).
- `OrreryMath.zodiac` → the twelve constellations' ecliptic longitude spans (equal 30° signs from 0° Aries *and* the IAU-boundary approximate spans; the wallpaper picks by setting).
- `OrreryMath.orbitPath(id, date, points)` → the ellipse as points for drawing.
- `OrreryMath.seasons(year)` → equinox/solstice instants (from the Earth's heliocentric longitude crossing 0/90/180/270°, found by bisection) for the date readout.

- [ ] **Step 1: Write the failing tests:** Kepler solver converges for e = 0, 0.2056 (Mercury), 0.25; the Earth's heliocentric ecliptic longitude at the 2026 March equinox (2026-03-20 14:46 UTC) is `180° ± 0.5°`; **Mars at opposition 2025-01-16** has the same heliocentric longitude as Earth within 1.5°; **Jupiter at opposition 2026-01-10** likewise within 1.5°; Venus's greatest elongation (2026-08-15, ~45.9° east) within 1.5°; `seasons(2026)` gives the June solstice within 2 hours of 2026-06-21 08:24 UTC; the full moon of 2026-11-24 (~14:53 UTC) has phase ≈ 0.5 ± 0.03 and the new moon of 2026-11-09 ≈ 0 ± 0.03; `heliocentric` at 1750 and 2200 returns finite values and `inRange` false; Mars is retrograde on 2025-01-16 and prograde on 2025-06-01.
- [ ] **Step 2: Run** `node --test tools/orrery.test.mjs` → fails.
- [ ] **Step 3: Implement** `orrery-math.js`.
- [ ] **Step 4: Run** → pass; `make test lint audit` pass.
- [ ] **Step 5: Commit** — `Orrery: Keplerian planets, the Moon, Galilean moons, seasons (tests)`

---

### Task 6: Orrery — the wallpaper

**Files:**
- Create: `web/wallpapers/orrery/orrery.js` (`OrreryAnimationManager`; `orrery-looks.js` for the three looks if large), `defaults.js`, `settings.js`, `thumb.webp`
- Modify: `web/wallpapers/catalog.js`, `tools/smoke.mjs` (`STAGE_CHECKS`), `tools/thumbnails.mjs` (if needed), `SPEC.md` (§2, a new §10.26 *Orrery* with *As built*, and §10.5's suggestion marked built), `README.md`

**Catalog:** `{ id: 'orrery', name: 'Orrery', icon: '🪐', accent: '#e8c17a', background: '#04060c', scripts: ['orrery/orrery-math.js', ...], make: host => new OrreryAnimationManager(host), cost: 'low', motion: 'slow', interactive: true, keys: [...], effects: [['glow', 'medium'], ['belt', 'medium']] }`. No network.

**What it shows (implement all of it):**
- **The real solar system now** (from `host.now()`), or **time-lapse** (`speed`: `live | 1 h/s | 1 day/s | 1 week/s | 1 month/s | 1 year/s`, default `live`; keys `=` (or `+`) faster, `-` slower, `0` back to now (`[`/`]` are the player's) with a toast naming the date). In time-lapse a date readout shows the simulated date and season ("1 day/s · 12 Mar 2031 · spring equinox in 8 days"); outside 1800–2050 it says "approximate".
- **Three looks** (`look`):
  - `space` (default): a starfield (seeded, cached), the Sun with a baked corona sprite, planets as shaded spheres (a baked terminator facing the Sun), Saturn's rings, orbits as thin ellipses, optional comet-like **trails** behind each planet showing its recent path, the **asteroid belt** as a pooled, seeded particle ring orbiting at Kepler's rate (`effects: belt`), and the Moon around Earth (exaggerated distance) with its real phase.
  - `brass`: an antique mechanical orrery — a polished brass sun on a pillar, planets on brass arms from a central hub, gear wheels that turn with the arms (drawn in code: toothed circles, cached per size), a walnut base hint at the bottom, ivory planet balls, engraved zodiac ring with glyphs. Same positions, mechanical style.
  - `chart`: a clean astronomical chart — black ink on parchment (or `chart` palette: parchment | night), concentric orbits, planet glyphs (☿♀♁♂♃♄⛢♆), the zodiac ring with constellation names, today's geocentric lines from Earth to each planet showing where to look in the sky, retrograde planets marked "R".
- **Scale** (`scale`: `compressed` (default; radius ∝ a^0.45 so all eight fit) | `true` (true distances; inner planets bunch up, Neptune at the edge) | `inner` (Mercury–Mars, filling the screen, plus the belt)). **View** (`view`: `top` (ecliptic from above) | `tilted` (a perspective camera 25° above the plane, slowly orbiting when `drift` is on)). Planet size exaggeration (`planetSize` 0.5–2, step 0.1, default 1). Toggles: `showOrbits`, `showLabels`, `showMoons` (the Moon and Jupiter's four), `showZodiac`, `showTrails`, `showBelt`, `showPluto`, `showInfo` (the corner readout).
- **Interaction:** tap a planet → it's selected: a label card with its distance from the Sun and from Earth (AU and light-minutes), where it is in our sky (constellation), and whether it's retrograde; tap empty space to deselect. Drag (in `tilted`) rotates the camera; the setting `touch` ignores touch. Key `l` cycles the look, `s` the scale.
- **Cost:** in `live` with `drift` off nothing moves for minutes → redraw once a minute and idle (`host.idleUntil`), with the corona and belt shimmer only when `motion` isn't `reduce`; time-lapse and drift run at full rate with cached layers (starfield, orbits per camera change, gears per size).

- [ ] **Step 1:** Catalog, `defaults.js`, `settings.js` (🪐 System, 🎨 Look, ⏩ Time, ⚙️ Advanced). `make test` passes.
- [ ] **Step 2:** The manager, the projection (top/tilted), the three looks, time-lapse, selection, keys, `applySettings`, `onQuality`, idle.
- [ ] **Step 3:** `STAGE_CHECKS.orrery`: draws in each look; at `?date=2025-01-16T12:00:00Z` Mars and Earth are on the same ray from the Sun (the manager exposes its last projected positions for the check, e.g. `manager.debugPositions()`); `=` changes the speed (toast) and the date readout advances; `0` returns to now; a tap on a planet's projected position shows its card; phone size fits the short side; idles at `live`/no drift.
- [ ] **Step 4:** Thumbnail; `dist/smoke/orrery.png`; `?tier=low`; bench under budget.
- [ ] **Step 5:** Docs (SPEC §2, §10.26, §10.5 note, README). `make ci` passes.
- [ ] **Step 6: Commit** — `Orrery: the solar system right now, in deep space, brass or ink, with time-lapse`

---

### Task 7: The whole set, once more

**Files:** `SPEC.md` (the status header's wallpaper count and list, §4.8's bench table if it lists every wallpaper), `README.md` (the count), anything the earlier tasks left inconsistent.

- [ ] **Step 1:** `make screenshots` (if it exists and is cheap) or open each new wallpaper with `?panel=open`, `?tier=low`, `?host=android`, `?host=windows&insets=0,0,48,0` in headless Chrome screenshots (via `tools/smoke.mjs <id>`), and look at every image.
- [ ] **Step 2:** Fix the counts ("all 34 wallpapers" → the real number) and any doc drift.
- [ ] **Step 3:** `make ci` passes; `make audit-history` passes.
- [ ] **Step 4: Commit** — `Weather, World Clock and Orrery: docs and counts`
