# wallpapers

Toy animated wallpapers: snow, rain, falling leaves, fireflies, a fireplace,
northern lights, a fish tank, a Halloween night, an advent calendar, a
self-playing 8-bit adventure, and more. Each one is a canvas animation that
fills the screen and does nothing else.

They run in three places:

- **A web page**: open it and you see only the wallpaper. Press `,` for the
  wallpaper picker and its settings.
- **Chrome's new tab**, through a small extension.
- **Android's home screen**, as a live wallpaper (planned).

Everything is plain HTML, CSS and JavaScript. There's no build step, and
nothing is fetched from the network except the Bing image of the day.

> **Status: early.** The wallpapers are being moved in from an older
> project. The plan and roadmap are in [SPEC.md](SPEC.md).

## Use

*Coming with the first wallpapers (roadmap phases 2–5).*

| Key | Action |
|---|---|
| `,` | Open or close the wallpaper picker and settings |
| `Esc` | Close the panel |
| `F` | Toggle fullscreen |
| `?` | Show the keys |

## Development

Requirements: `make`, Node.js 20 or later, Python 3 (for `make serve`), and
Google Chrome or Chromium (for the tests). There are no npm packages to
install.

Run `make` to list every target.

| Target | What it does |
|---|---|
| `make hooks` | Install the git pre-commit hook (runs `make audit`) |
| `make serve` | Serve `web/` at http://localhost:8000 |
| `make lint` | Syntax-check every script |
| `make audit` | Scan the repo for anything private (see below) |
| `make test` | Run the tests |
| `make ci` | Everything CI runs: lint, audit, test |
| `make clean` | Remove build output |

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

## License

[MIT](LICENSE)
