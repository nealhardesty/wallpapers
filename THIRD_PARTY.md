# Third-party content and provenance

All code and art in this repository is original and MIT licensed (see
[LICENSE](LICENSE)), except as noted below. This file records where things
came from, what was deliberately left out, and why.

## Origin

The wallpapers were written for a private homepage project and imported here
as a fresh copy, without that project's git history (SPEC §7.1). Before the
import they were checked for copyright notices, license headers and code
ported from elsewhere. None was found.

## Inspirations, with no copied code or assets

| Wallpaper | Inspired by | What we ship |
|---|---|---|
| snow | *xsnow* (Rick Jansen; later Willem Vermin, GPL-3+) | Our own physics. The tree and flakes are code-drawn pixel art in `snow.js`, an homage to the classic xsnow look. xsnow's pixmaps are **not** included. |
| neko | *Neko* (Naoshi Watanabe, 1989) and *oneko* (Masayuki Koba) | Behaviour only: chase, yawn, scratch, wash, sleep. The cat is our own 16×16 pixel art, drawn in code (`NekoSprites` in `neko.js`), in eight coats. The decades of community sprite packs, including trademarked characters, are **not** included. |
| quest | Classic top-down 8-bit adventure games | Original sprites, tiles, font and world generator. A few affectionate parody lines and names ("IT'S A SECRET TO EVERYBODY", Lonk, Zelderp). No game assets. |
| matrix | The "digital rain" from the film *The Matrix* | Rendered from the system monospace font. |

## Network content

| Source | Used by | Notes |
|---|---|---|
| Bing image of the day (`www.bing.com`) | bing | Photos are © their respective owners, as credited in Bing's data, and shown with that credit in the overlay. They are loaded from Bing at view time and never stored or redistributed here. |
| CelesTrak general-perturbation elements (`celestrak.org`) | satellites | Orbital elements (public US Space Force data, distributed by CelesTrak), fetched at view time at most every 12 hours and cached on the device, never redistributed here. The offline sample orbits in `data.js` are made up. |
| Open-Meteo geocoding (`geocoding-api.open-meteo.com`) | the location panel (SPEC §10.1) | Keyless; a typed place name is sent once, and only coordinates rounded to 0.1° are kept. |
| `corsproxy.io`, `api.allorigins.win`, `cors-anywhere.herokuapp.com` | bing | Public CORS proxies, used only if the person turns on "Use public proxies when opened from disk" in Bing's settings (off by default; SPEC §4.6). |

## Algorithms and test data

| Item | Where | Notes |
|---|---|---|
| SGP4 | `web/wallpapers/satellites/sgp4.js` | Our own implementation of the published model: Hoots & Roehrich, *Spacetrack Report #3* (1980), as revised in Vallado, Crawford, Hujsak & Kelso, *Revisiting Spacetrack Report #3* (AIAA 2006-6753). No code copied. |
| SGP4 verification vectors | `tools/satellites.test.mjs` | A few published elements and positions from that paper's verification set, quoted as test data. |

## Fonts and emoji

Only system fonts and system emoji are used. None are bundled.
