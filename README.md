# wallpapers

Toy animated wallpapers: snow, rain, falling leaves, fireflies, a fireplace,
northern lights, a fish tank, a Halloween night, an advent calendar, a
self-playing 8-bit adventure, and more. Each one is a full-screen canvas
animation with no page around it. Most just play; some also respond to you.
Click to feed the fish, light the jack-o'-lanterns, or take over Pixel
Quest's hero with the arrow keys.

They run in three places:

- **A web page**: open it and you see only the wallpaper. Press `,` for the
  wallpaper picker and settings, `[` and `]` to switch.
- **Chrome's new tab**, through a small extension.
- **Android's home screen**, as a live wallpaper (planned).

Everything is plain HTML, CSS and JavaScript, with no build step. Most
wallpapers work fully offline. The online ones, such as the Bing image of
the day, need no API keys.

> **Status: working.** Open `web/index.html` and it plays, with a picker and
> settings panel. Next: the Chrome extension and a hosted copy. The plan and
> roadmap are in [SPEC.md](SPEC.md).

## Use

Open `web/index.html`, straight from disk or through `make serve`. You see
only the wallpaper. On first run it's **Seasonal**: snow from January to
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

**Wallpapers:** Seasonal 📅, Blank ⬛, Snow ❄️, Rain 🌧️, Falling Leaves 🍂,
Fireflies ✨, Fireplace 🔥, Northern Lights 🌌, Parallax Clouds ☁️,
Mountains 🏔️, Starfield 🌠, Cherry Blossoms 🌸, Halloween Night 🎃,
Matrix 🟩, Fish Tank 🐠, Advent Calendar 🎁, Pixel Quest ⚔️, and the Bing
Image of the Day 🖼️, and Neko 🐈, a pixel cat that chases your pointer
(or finger), washes, yawns and naps.

The Bing photo needs a connection, and a browser only lets a page reach it
when the page is served: run `make bing-json` and then `make serve`. Opened
straight from disk, it explains this instead (or uses public proxies, if you
allow them in its settings).

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
| `make docker-build` | Build the container image `wallpapers` |
| `make docker-run` | Run it at http://localhost:8000 (read-only, unprivileged) |
| `make lint` | Syntax-check every script and JSON file |
| `make audit` | Scan the working tree for anything private (see below) |
| `make audit-staged` | Scan only what is staged for commit |
| `make audit-history` | Scan every file version ever committed |
| `make test` | Run the unit tests |
| `make smoke` | Boot every wallpaper in headless Chrome; screenshots go to `dist/smoke/` |
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
