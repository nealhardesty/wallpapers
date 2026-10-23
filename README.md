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

> **Status: working** as a web page and a Chrome new tab. Next: Android
> live wallpapers. The plan and roadmap are in [SPEC.md](SPEC.md).

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
   `wallpapers-extension` from the latest
   [CI run](https://github.com/nealhardesty/wallpapers/actions/workflows/ci.yml)
   and unzip it.
2. Open `chrome://extensions`, turn on Developer mode, click **Load
   unpacked** and pick that folder.
3. Open a new tab. Chrome asks once whether to keep the change; keep it.

Chrome puts the cursor in the address bar on a new tab, so click the page
once before pressing `,`, or use the gear in the top-right corner. The
extension asks for one permission, reading `www.bing.com`, so the Bing
wallpaper can fetch its photo; nothing else leaves your machine.

**On a phone,** for now. Open the hosted copy and choose *Add to Home
screen*: it opens full screen, with no browser around it. Hold the
top-right corner for the panel. A real Android live wallpaper is next on
the roadmap.

<img src="docs/phone.webp" width="260" alt="The panel as a bottom sheet on a phone">

## Use

You see only the wallpaper. On first run it's **Seasonal**: snow from January to
April, the fish tank in May and November, fireflies in summer, falling
leaves in September, Halloween in October and the advent calendar in
December.

| Key | Action |
|---|---|
| `,` | The panel: every wallpaper, and the current one's settings |
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
- Performance (Auto, Low, Medium, High). Low draws fewer pixels and frames,
  which is easier on batteries.
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
| `?w=advent&date=2026-12-25` | Time-travel the advent calendar (`&theme=` picks a theme) |
| `?tier=low` | Low, medium or high performance tier (fewer pixels and frames on low) |
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
| `make docker-build` | Build the container image `wallpapers` |
| `make docker-run` | Run it at http://localhost:8000 (read-only, unprivileged) |
| `make lint` | Syntax-check every script and JSON file |
| `make audit` | Scan the working tree for anything private (see below) |
| `make audit-staged` | Scan only what is staged for commit |
| `make audit-history` | Scan every file version ever committed |
| `make test` | Run the unit tests |
| `make smoke` | Build the extension, then boot every wallpaper, the player and the extension in headless Chrome; screenshots go to `dist/smoke/` |
| `make ci` | Everything CI runs: lint, audit, audit-history, test, smoke |
| `make clean` | Remove build output |

### HTTPS and phones

To try the wallpapers on a phone, serve them on your network:
`HOST=0.0.0.0 make serve-https`, then open the printed address. The
certificate is self-signed, so the browser warns once. Accept it, or trust
`.cert/cert.pem` on the device. HTTPS matters off localhost because some
browser features only work on secure pages.

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
