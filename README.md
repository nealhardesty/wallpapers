# wallpapers

Toy animated wallpapers: snow, rain, falling leaves, fireflies, a fireplace,
northern lights, a fish tank, a Halloween night, an advent calendar, a
self-playing 8-bit adventure, and more. Each one is a full-screen canvas
animation with no page around it. Most just play; some also respond to you.
Click to feed the fish, light the jack-o'-lanterns, or take over Pixel
Quest's hero with the arrow keys.

**[Try it: nealhardesty.github.io/wallpapers](https://nealhardesty.github.io/wallpapers/)**, then press `,`.

![The settings panel open over the fireplace](docs/panel.webp)

Everything is plain HTML, CSS and JavaScript, with no build step. Most
wallpapers work fully offline. The online ones, such as the Bing image of
the day, need no API keys.

> **Status: working** as a web page, a Chrome new tab and an Android live
> wallpaper (sideloaded). The plan and roadmap are in [SPEC.md](SPEC.md).

## The wallpapers

Click one to see it live.

| | | | |
|:-:|:-:|:-:|:-:|
| [<img src="web/wallpapers/snow/thumb.webp" width="200" alt="Snow">](https://nealhardesty.github.io/wallpapers/?w=snow)<br>❄️ Snow | [<img src="web/wallpapers/rain/thumb.webp" width="200" alt="Rain">](https://nealhardesty.github.io/wallpapers/?w=rain)<br>🌧️ Rain | [<img src="web/wallpapers/leaves/thumb.webp" width="200" alt="Falling Leaves">](https://nealhardesty.github.io/wallpapers/?w=leaves)<br>🍂 Falling Leaves | [<img src="web/wallpapers/fireflies/thumb.webp" width="200" alt="Fireflies">](https://nealhardesty.github.io/wallpapers/?w=fireflies)<br>✨ Fireflies |
| [<img src="web/wallpapers/fireplace/thumb.webp" width="200" alt="Fireplace">](https://nealhardesty.github.io/wallpapers/?w=fireplace)<br>🔥 Fireplace | [<img src="web/wallpapers/northern-lights/thumb.webp" width="200" alt="Northern Lights">](https://nealhardesty.github.io/wallpapers/?w=northern-lights)<br>🌌 Northern Lights | [<img src="web/wallpapers/parallax-clouds/thumb.webp" width="200" alt="Parallax Clouds">](https://nealhardesty.github.io/wallpapers/?w=parallax-clouds)<br>☁️ Parallax Clouds | [<img src="web/wallpapers/mountains/thumb.webp" width="200" alt="Mountains">](https://nealhardesty.github.io/wallpapers/?w=mountains)<br>🏔️ Mountains |
| [<img src="web/wallpapers/starfield/thumb.webp" width="200" alt="Starfield">](https://nealhardesty.github.io/wallpapers/?w=starfield)<br>🌠 Starfield | [<img src="web/wallpapers/cherry-blossoms/thumb.webp" width="200" alt="Cherry Blossoms">](https://nealhardesty.github.io/wallpapers/?w=cherry-blossoms)<br>🌸 Cherry Blossoms | [<img src="web/wallpapers/halloween/thumb.webp" width="200" alt="Halloween Night">](https://nealhardesty.github.io/wallpapers/?w=halloween)<br>🎃 Halloween Night | [<img src="web/wallpapers/neko/thumb.webp" width="200" alt="Neko">](https://nealhardesty.github.io/wallpapers/?w=neko)<br>🐈 Neko |
| [<img src="web/wallpapers/matrix/thumb.webp" width="200" alt="Matrix">](https://nealhardesty.github.io/wallpapers/?w=matrix)<br>🟩 Matrix | [<img src="web/wallpapers/fishtank/thumb.webp" width="200" alt="Fish Tank">](https://nealhardesty.github.io/wallpapers/?w=fishtank)<br>🐠 Fish Tank | [<img src="web/wallpapers/advent/thumb.webp" width="200" alt="Advent Calendar">](https://nealhardesty.github.io/wallpapers/?w=advent)<br>🎁 Advent Calendar | [<img src="web/wallpapers/quest/thumb.webp" width="200" alt="Pixel Quest">](https://nealhardesty.github.io/wallpapers/?w=quest)<br>⚔️ Pixel Quest |

Also: **Seasonal** 📅 picks by month (the default), **Blank** ⬛ is just
black, and the **Bing Image of the Day** 🖼️ shows Bing's photo with its
credit.

## Install

**As a web page.** Open [the hosted copy](https://nealhardesty.github.io/wallpapers/), or `web/index.html`
straight from a clone, or run `make serve`. To make it Chrome's start page
without the extension, set Settings → On startup → Open a specific page to
the hosted address.

**As Chrome's new tab.** Every new tab shows the wallpaper.
1. Get the extension: `make extension` builds `dist/extension/`. Or download
   `wallpapers-extension-<version>.zip` from the latest
   [release](https://github.com/nealhardesty/wallpapers/releases) (or the
   `wallpapers-extension` artifact of a
   [CI run](https://github.com/nealhardesty/wallpapers/actions/workflows/ci.yml))
   and unzip it somewhere it can stay.
2. Open `chrome://extensions`, turn on Developer mode, click **Load
   unpacked** and pick that folder.
3. Open a new tab. Chrome asks once whether to keep the change; keep it.

Its ID is always `hajnldgffgkdnbimdihipffnimjckgcp`, whichever folder you
load it from, so a new version unpacked somewhere else keeps your settings.

Chrome puts the cursor in the address bar on a new tab, so click the page
once before pressing `,`, or use the gear in the top-right corner. The
extension asks for one permission, reading `www.bing.com`, so the Bing
wallpaper can fetch its photo; nothing else leaves your machine.

**Moving from the old homepage.** Its wallpaper settings come with you:
the wallpaper you'd picked, every setting you changed, and the advent
calendar's memory of the last door it celebrated. Settings you never
touched take today's defaults. Links, weather, search and clocks stay
behind.
1. On an old homepage tab, open the console (⌥⌘J on a Mac, Ctrl+Shift+J
   elsewhere). If Chrome asks, type `allow pasting` first. Paste this and
   press Enter; it downloads `homepage-wallpapers.json`, and reads nothing
   but the wallpaper keys:

   ```js
   (() => {
     const keep = k => /Config$/.test(k) || ['wallpaperPreference', 'adventCelebrated', 'adventLastSeen'].includes(k);
     const data = { app: 'homepage', exported: new Date().toISOString(),
       localStorage: Object.fromEntries(Object.keys(localStorage).filter(keep).map(k => [k, localStorage.getItem(k)])) };
     const a = document.createElement('a');
     a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
     a.download = 'homepage-wallpapers.json';
     a.click();
   })();
   ```
2. In `chrome://extensions`, turn the old homepage off, and install this
   extension (above).
3. Open a new tab, press `c` (or `,`), choose **Import** and pick the file.
   A note says what came over.

The same file imports on the hosted copy and in the Android app.

**On Android, as a live wallpaper.** Download `wallpapers-<version>.apk`
from the latest [release](https://github.com/nealhardesty/wallpapers/releases)
(or `make android-install` with a phone connected) and install it; your
phone asks you to allow installs from the browser once. Open **Wallpapers**
from the app drawer: it's the panel, with a **Set as wallpaper** button.
On the home screen, taps and drags reach the wallpaper (feed the fish, wake
the cat), and the mountains, clouds and stars pan as you swipe between
pages. It pauses whenever it's covered, and runs at Medium and 30 fps at
most, lower on battery saver or when the phone is warm.

**On any phone,** without installing anything: open the hosted copy and
choose *Add to Home screen*. It opens full screen, with no browser around
it. Hold the top-right corner for the panel.

<img src="docs/phone.webp" width="260" alt="The panel as a bottom sheet on a phone">

## Use

You see only the wallpaper. On first run it's **Seasonal**: snow from January to
April, the fish tank in May and November, fireflies in summer, falling
leaves in September, Halloween in October and the advent calendar in
December.

| Key | Action |
|---|---|
| `,` or `c` | The panel: every wallpaper, and the current one's settings |
| `[` / `]` | Previous / next wallpaper (remembered) |
| `←` / `→` | Switch, while the panel is open |
| `f` | Fullscreen |
| `?` | All keys, including the current wallpaper's own |
| `Esc` | Close |

On a touch screen, hold the top-right corner to open the panel. With a
mouse, a gear appears when you move toward that corner.

**The panel:**
- Every wallpaper, with a thumbnail. Hover one for a moment to see it play.
- The current wallpaper's settings, which take effect as you change them.
  A dot marks anything you've changed; click it to put that setting back.
- Performance: **Auto** (the default) watches how long each frame takes
  and gives up detail in small steps when the device struggles, then
  takes it back when it's calm; it remembers where each wallpaper settled.
  **Low**, **Medium** and **High** pin it. Low draws fewer pixels, frames
  and particles, and drops expensive effects such as bloom and blur.
  Under it, a live readout shows what's happening.
- **Save power on battery** (on by default): on battery, Auto stays at
  Medium or below, and Low under 20%.
- ⚡ badges on the tiles show how hard each wallpaper works a phone.
- Reset, plus Export and Import, to move your settings to another browser.

**Some wallpapers have their own keys** (press `?` to see them):
- Pixel Quest: `N` new quest, `H` hero, `V` look, `T` hat, `M` companion,
  `P` palette. Arrows or WASD and Space take over the hero.
- Advent calendar: arrows time-travel, `0` today, `T` theme, `R` replay.

![Pixel Quest, mid-adventure](docs/quest.webp)

The Bing photo needs a connection. The hosted copy and the extension just
work. Locally, a browser only lets a page reach it when the page is served:
run `make bing-json` and then `make serve`. Opened straight from disk, it
explains this instead (or uses public proxies, if you allow them in its
settings).

**URL options**, for this visit only; nothing is saved:

| Add to the URL | Effect |
|---|---|
| `?w=fishtank` | Show this wallpaper |
| `?panel=open` | Open its settings on load |
| `?date=2026-12-25` or `?date=2026-12-31T23:59:50` | Time-travel any wallpaper that follows the date or hour; the clock ticks on from there. With advent, `&theme=` picks a theme |
| `?tier=low` | Low, medium or high performance tier (fewer pixels and frames on low) |
| `?hud=1` | A corner readout: frame rate, frame cost, quality step, power |
| `?seed=7` | The same random scene every time |

`web/stage.html?w=<id>` shows a single wallpaper on its own, without the
player around it.

## Development

Requirements:
- `make`, `git` and Node.js 22 or later
- Google Chrome or Chromium, for `make smoke` (set `CHROME_PATH` if it isn't
  found)
- `openssl`, for `make serve-https`
- Docker, for the container
- For Android: the Android SDK and a JDK 17 or later. With Android Studio
  installed in the usual place, the Makefile finds both (`ANDROID_HOME=`
  and `JAVA_HOME=` override). Gradle comes with the wrapper.

There are no npm packages to install.

First time in a fresh clone:

```sh
make hooks   # audit every commit, commit message and push
make ci      # lint, audit and test: the same thing CI runs
```

Run `make` to list every target.

| Target | What it does |
|---|---|
| `make hooks` | Install the git hooks in `.githooks/` |
| `make serve` | Serve `web/` at http://localhost:8000 (`PORT=` to change, `HOST=0.0.0.0` to reach it from a phone) |
| `make serve-https` | The same over https at https://localhost:8443, with a self-signed certificate made on first use |
| `make cert` | Make a fresh self-signed certificate in `.cert/` (localhost and your LAN addresses) |
| `make bing-json` | Fetch Bing's last eight images of the day into `web/bing.json`, so the Bing wallpaper works when served |
| `make thumbnails` | Re-render the panel's wallpaper thumbnails (they're committed: review the changes) |
| `make icons` | Render `web/icons/icon.svg` to the PNG icons the extension and web app need (committed) |
| `make screenshots` | Re-render the README's screenshots in `docs/` (committed: review the changes) |
| `make extension` | Build the Chrome extension: `dist/extension/` to load unpacked, and a zip |
| `make site` | Build the GitHub Pages copy in `dist/site/`, with a fresh `bing.json` |
| `make bench` | Every wallpaper at every tier on a simulated phone (4× slower CPU); checks the budgets, writes `bench/results.json` and the ⚡ badges |
| `make android-build` | Build the Android debug APK |
| `make android-install` | Install it on the connected phone or emulator and open it |
| `make android-logcat` | Follow the app's log, including the page's console |
| `make android-emulator` | Boot an emulator in the background (`AVD=`, `EMULATOR_FLAGS=-no-window`) |
| `make android-bench` | On a phone with the debug build set as wallpaper: frame cost, CPU and battery drain per wallpaper per tier |
| `make android-keystore` | Make the release signing key, outside the repo (once, ever) |
| `make android-release` | Build the signed release APK into `dist/` |
| `make docker-build` | Build the container image `wallpapers` |
| `make docker-run` | Run it at http://localhost:8000 (read-only, unprivileged) |
| `make lint` | Syntax-check every script and JSON file |
| `make audit` | Scan the working tree for anything private (see below) |
| `make audit-staged` | Scan only what is staged for commit |
| `make audit-history` | Scan every file version ever committed |
| `make test` | Run the unit tests |
| `make smoke` | Build the extension, then boot every wallpaper, the player and the extension in headless Chrome; screenshots go to `dist/smoke/` |
| `make smoke-live` | The same stage and player checks against the deployed site, with real network and Bing (`SMOKE_URL=` for another, e.g. `make serve`'s); CI runs it after every deploy |
| `make ci` | Everything CI runs: lint, audit, audit-history, test, smoke |
| `make clean` | Remove build output |

### HTTPS and phones

To try the wallpapers on a phone, serve them on your network:
`HOST=0.0.0.0 make serve-https`, then open the printed address. The
certificate is self-signed, so the browser warns once. Accept it, or trust
`.cert/cert.pem` on the device. HTTPS matters off localhost because some
browser features only work on secure pages.

### Releasing

1. Once: `make android-keystore`, back the key up somewhere safe, and add
   the four `WALLPAPERS_KEY*` secrets it prints to the GitHub repo
   (`gh secret set`). Losing the key means people must uninstall to
   update.
2. Bump `version` in `web/manifest.json` (it's the extension's and the
   app's version), commit, and push a matching tag: `git tag v0.6.0 &&
   git push --tags`.
3. CI checks everything, builds the signed APK and the extension zip, and
   publishes both on a GitHub Release.

### Adding a wallpaper

See "Building a new wallpaper" in [AGENTS.md](AGENTS.md). In short: a folder
under `web/wallpapers/` with the code, `defaults.js` and `settings.js`, an
entry in `catalog.js`, `make thumbnails`, and `make ci`.

### Keeping it public-safe

This is a public repo, so `make audit` fails if it finds any of these:

- private IP addresses
- email addresses, other than `noreply@`
- home-directory paths
- strings shaped like API keys
- URLs that aren't on the allowlist in `tools/audit.mjs`
- image metadata
- files over 1 MB

Put your own personal terms (names, hostnames, employer) one per line in
`.audit-denylist` at the repo root. Git ignores that file, so the list
stays private while every commit is still checked against it.

With `make hooks` installed, the audit runs three times:

- before each commit, on exactly what's staged
- on each commit message
- before each push, on the full history, since a secret that was committed
  and then deleted is still public once pushed

Findings are redacted in the output. If one is a false positive, add
`audit-allow: <reason>` on that line or the line above.

## License

[MIT](LICENSE)
