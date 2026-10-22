# AGENTS - Base rules for coding agents.

This is a simple toy project for creating animated wallpapers.  I use them
for my browser homepage, and for Android wallpaper backgrounds.


**Core Directive**: Go Above and Beyond.  You have creative freedom here; use it.  

Everything a user needs to setup and use this project will be found in `README.md`.
Keep instructions maintained in there.

Everything *about* the project — architecture, protocol, formats,
environment, accounts, commands, and every hard-won fact — is in **`SPEC.md`**. Read it before
changing anything. 

**Automation: everything has a `make` target.** The owner drives the project
through the root `Makefile`.
- Anything we implement that someone would run gets a target: build, test, lint,
  run, spikes, fixtures, releases, services.
- Each target carries a `## description` comment so that `make` (which runs
  `make help`) lists it.
- CI calls make targets, never raw `cargo` commands, so local runs and CI behave
  the same.
- Use make instead of `cargo xtask` or loose scripts. When a task needs real
  logic, write it as a script or binary and wrap it in a target.
- Mention new targets in the Development section of `README.md`.



## Building a new wallpaper

SPEC.md §4 has the full contract. The short version:

1. **Files.** Create `web/wallpapers/<id>/` (lowercase, hyphenated id) with:
   - `<id>.js`: a manager class, e.g. `class TidePoolAnimationManager`.
     Split big wallpapers into several files, loaded in order.
   - `defaults.js`: `WP.defaults('<id>', { configVersion: 1, ... })`. Every
     setting's default value, and nothing else. Plain JSON-safe values. Bump
     `configVersion` when a setting changes meaning.
2. **Catalog.** Add an entry to `web/wallpapers/catalog.js`:
   - `id`, `name`, `icon` (one emoji), `scripts`, and `make: host => new YourManager(host)`
   - when they apply: `interactive`, `motion: 'slow'`, `network: [hosts]`,
     `cost`, `background`
3. **The manager.** `constructor(host)`, optional `async init()`,
   `start()`, `stop()`, `showConfigDialog()`.
   - Settings: `this.config = WP.settings.load()` and
     `WP.settings.save(this.config)`. Never touch `localStorage` directly.
     State that isn't a setting goes through `host.storage`.
   - Draw on your own full-screen canvas: `position: fixed`, `z-index: -1`,
     `pointer-events: none`. Interactive wallpapers listen on `document`.
   - Animate only with `requestAnimationFrame` (the stage paces and pauses
     it), and move by elapsed time from its timestamp, not per frame.
   - Keep ground lines above `host.insets.bottom`.
   - Look alive on the first frame: seed the scene, don't fade in from
     black.
4. **Public-repo rules.**
   - No API keys.
   - No network unless declared in the catalog's `network` *and* allowed in
     `URL_ALLOW` in `tools/audit.mjs`, with an offline state that isn't
     blank.
   - Prefer art drawn in code. Anything not ours needs a clear licence and
     a line in `THIRD_PARTY.md`.
5. **Cheap by default** (SPEC §4.8):
   - no per-frame `getImageData`/`putImageData`, `shadowBlur` or `ctx.filter`
   - cache static layers
   - pool particles
   - check it at `?tier=low`
6. **Verify.**
   - `make ci` must pass. The smoke test boots your wallpaper with fresh
     storage and fails if it doesn't draw, can't open its settings, logs an
     error, touches the network, writes storage outside `wp:<id>:*`, or
     would save anything on a fresh run (i.e. `defaults.js` doesn't match
     what the code uses).
   - Look at `dist/smoke/<id>.png`.
   - Try `web/index.html?w=<id>`, `?w=<id>&tier=low` and
     `?w=<id>&host=android`.
7. **Docs.** Add the wallpaper to SPEC.md §2 and, once it's in the menu, to
   the README.

---

## Coding Behavioral Guidelines 

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria lets you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

