# wallpapers

Toy animated wallpapers: snow, rain, falling leaves, fireflies, a fireplace,
northern lights, a fish tank, a Halloween night, an advent calendar, a
self-playing 8-bit adventure, and more. Each one is a full-screen canvas
animation with no page around it. Most just play; some also respond to you.
Click to feed the fish, light the jack-o'-lanterns, or take over Pixel
Quest's hero with the arrow keys.

They run in three places:

- **A web page**: open it and you see only the wallpaper. Press `,` for the
  wallpaper picker and its settings.
- **Chrome's new tab**, through a small extension.
- **Android's home screen**, as a live wallpaper (planned).

Everything is plain HTML, CSS and JavaScript, with no build step. Most
wallpapers work fully offline. The online ones, such as the Bing image of
the day, need no API keys.

> **Status: early.** The wallpapers have been moved in from an older
> project; the page that ties them together comes next. The plan and roadmap are in [SPEC.md](SPEC.md).

## Use

*Coming with the first wallpapers (roadmap phases 2–5).*

| Key | Action |
|---|---|
| `,` | Open or close the wallpaper picker and settings |
| `Esc` | Close the panel |
| `F` | Toggle fullscreen |
| `?` | Show the keys |

## Development

Requirements: `make`, `git`, Node.js 22 or later, Google Chrome or Chromium
(for `make smoke`; set `CHROME_PATH` if it isn't found), and Python 3 (for
`make serve`). There are no npm packages to install.

First time in a fresh clone:

```sh
make hooks   # audit every commit, commit message and push
make ci      # lint, audit and test: the same thing CI runs
```

Run `make` to list every target.

| Target | What it does |
|---|---|
| `make hooks` | Install the git hooks in `.githooks/` |
| `make serve` | Serve `web/` at http://localhost:8000 (`PORT=` to change) |
| `make lint` | Syntax-check every script and JSON file |
| `make audit` | Scan the working tree for anything private (see below) |
| `make audit-staged` | Scan only what is staged for commit |
| `make audit-history` | Scan every file version ever committed |
| `make test` | Run the unit tests |
| `make smoke` | Boot every wallpaper in headless Chrome; screenshots go to `dist/smoke/` |
| `make ci` | Everything CI runs: lint, audit, audit-history, test, smoke |
| `make clean` | Remove build output |

### Trying a single wallpaper

While the main page is being built (roadmap phase 3), `web/dev/harness.html`
runs any one wallpaper on its own. Open it straight from disk, or via
`make serve` at http://localhost:8000/dev/harness.html.

- `?w=fishtank` picks a wallpaper
- `&panel=open` opens its settings on load
- `c` opens its settings
- `[` and `]` switch to the previous or next wallpaper
- `g` goes back to the gallery

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
