---
name: releaseme
description: Cut a Wallpapers release from what is already merged on master, the way this repo does it. Bump the version in its four places on a version-X.Y.Z branch, open the "Version X.Y.Z" PR, wait for its CI and fix anything that broke until it is green, then merge, tag vX.Y.Z on the merge commit, and watch the tag's CI run publish the GitHub Release (APK, extension, Mac and Windows zips), fixing new breakage the same way. Start it when the user types /releaseme or asks for a release as part of a larger request ("merge it, then /releaseme", "…and cut a release"), optionally with patch|minor|major|X.Y.Z and a one-line summary. Never start a release on your own initiative.
context: fork
allowed-tools: Bash(git *) Bash(gh *) Bash(make *) Bash(shasum *) Read Edit Write Grep Glob
---

<!-- One skill for every agent: it lives in `.agents/skills/` (the shared Agent Skills location;
Codex and others read it), and `.claude/skills/releaseme` is a symlink to it. `context: fork`,
`allowed-tools` are Claude Code's keys (run it as a background subagent, pre-allow git/gh/make);
other agents ignore them. An agent may start it, but only because the user asked for a release. -->

# /releaseme: bump → Version PR → green CI → merge → tag → watch the Release

The user's arguments, if any: `$ARGUMENTS`. A bump level (`patch`, `minor`, `major` or `X.Y.Z`;
default: see §0) and/or a one-line summary for the PR body.

The user asked for a release (typed `/releaseme`, or asked for one in a larger request that an
agent is carrying out), which authorizes every step below. Run them without stopping to
ask. **Follow the repo's rules: never `--admin`, never merge a red or pending PR, never push
to `master` directly, never move or delete a tag, never commit a secret.** Stop and report when
a rule below says to, or when a step fails in a way this file doesn't cover.

**How this repo releases** (README "Releasing", SPEC §6.6 and §10.21, `.github/workflows/ci.yml`):
features land on master through their own PRs. A release is a separate, small PR titled
`Version X.Y.Z` on branch `version-X.Y.Z` that only bumps the version (PRs #73, #76). Once it is
merged, a lightweight tag `vX.Y.Z` on its merge commit makes `ci.yml` run on the tag, and its
`release` job builds the signed APK and the extension, collects the Mac and Windows zips, and
runs `gh release create vX.Y.Z --generate-notes`. There is no CHANGELOG file: the release notes
are GitHub's generated list of PR titles since the previous tag.

**Other agents may be committing at the same time.** master can move under you at any point,
and another agent may bump the version or push the tag you were about to use. Rebasing onto
the latest master is routine here, not an exception: do it whenever §R says to, without asking.

Everything that waits (CI, a run to appear, `make ci`) runs as a **background** command, so
you're told when it ends: in Claude Code, Bash with `run_in_background: true`; elsewhere your
agent's background or async shell, or `cmd &` then `wait`. Never poll in a tight loop.

## 0. Preflight

- `git fetch origin --tags`, then `git status --short`. **A release ships only what is merged.**
  Uncommitted changes, or local commits not on `origin/master`, are someone's unfinished work:
  don't sweep them into a version PR. If they belong to work that isn't part of this release
  (the owner's edits on another branch), leave them untouched and do the whole release in a fresh
  worktree instead: `git worktree add -b version-X.Y.Z <scratch dir> origin/master`, and remove
  it at the end. If they look like work meant for this release, say so and stop (it goes
  through its own PR first).
- Be on master at `origin/master`: `git checkout master && git pull --ff-only` (in the fresh worktree, you already are).
- Latest tag: `git describe --tags --abbrev=0`. If `git log --oneline <tag>..origin/master` is
  empty, there is nothing to release. Say so and stop.
- `gh auth status` must pass.
- Hooks: if `git config core.hooksPath` isn't `.githooks`, run `make hooks` (it audits every
  commit, commit message and push for anything private; the repo is public).
- **Someone else's release in flight?** `gh pr list --state open --search "Version in:title"`.
  An open `Version …` PR means another agent is releasing: stop and report its URL.
- **Baseline:** note master's latest CI result before touching anything:
  `gh run list --workflow ci.yml --branch master --event push --limit 1 --json conclusion,headSha,databaseId`.
  If it failed, keep its failing jobs (`gh run view <id> --json jobs`). Those failures are
  *pre-existing*, not ours (see §4). The nightly `schedule` runs (Bing refresh, Pages,
  `smoke-live`) count too: look at the latest one the same way with `--event schedule`.
- **Pick the version.** Current: `version` in `web/manifest.json`. If the user named a level or
  `X.Y.Z`, use it. Otherwise read what landed since the tag
  (`gh pr list --state merged --search "merged:>=<tag date>"`, or the log above): any new
  wallpaper, wallpaper pass or feature means **minor** (`0.25.0` → `0.26.0`, the usual case);
  only fixes means **patch** (`0.17.0` → `0.17.1`, as v0.17.1, v0.10.x and v0.7.x did). The
  project is pre-1.0: never go `major` unless the user asks. Call the version `X.Y.Z` from here
  on. It must be newer than the latest tag.
- `git rev-parse -q --verify refs/tags/vX.Y.Z` and `git ls-remote --tags origin vX.Y.Z` must
  both find nothing, else stop.
- In the background, run `make ci` (lint, audit, audit-history, unit tests, the Windows unit
  tests when dotnet is installed, and the headless-Chrome smoke of every wallpaper). It's what
  the PR's `ci` job runs, so each failure caught here saves a CI round trip. If it fails on
  master as it stands, that's pre-existing breakage: report it and stop, because the release
  would ship it.

## R. Rebase onto the latest master (whenever master moved)

Run this before the first push, whenever `gh pr view <pr> --json mergeStateStatus` says
`BEHIND` or `DIRTY`, whenever a merge is refused because the branch is out of date, and before
every merge attempt:

1. `git fetch origin`. If `git merge-base --is-ancestor origin/master HEAD` succeeds, you're up
   to date: skip the rest.
2. `git rebase origin/master`.
3. **Conflicts:** resolve each one by keeping both intents: theirs is already on master and must
   survive, and yours goes on top. Then `git add` and `git rebase --continue`.
   - **Version (the four files in §1):** if master's version is now `X.Y.Z` or newer, another
     agent released while you worked. `git rebase --abort`, close your PR with a comment naming
     theirs, and report: there's nothing left for this release to do. If master's version is
     still older, keep yours.
   - **SPEC.md and README.md** (lists, status lines): keep both entries.
   - **Code:** a version PR touches no code, so a code conflict means something is wrong.
     `git rebase --abort`, leave the PR as it is, and report the conflicting files. Never
     resolve by dropping someone else's work.
4. Re-run `make ci` if anything new came in from master that touches `web/`, `tools/`,
   `android/`, `mac/` or `windows/` (the release will ship it, so it must pass).
5. A branch you already pushed: `git push --force-with-lease`. That is the **only** force-push
   allowed, only on this PR's own branch, and the lease refuses if someone else pushed to it.
   Then CI runs again on the new head: back to §2. Earlier green results don't count after a
   rebase.

## 1. Bump, commit and open the PR

- Branch: `git checkout -b version-X.Y.Z`.
- Bump the version in **all four places** (SPEC §5 "Version"; `tools/wp.test.mjs` fails if they
  disagree), changing nothing else on those lines:
  - `web/manifest.json`: `"version": "X.Y.Z"`. The source of truth: the extension, the zips'
    and APK's file names, and Android's `versionName`/`versionCode`
    (`android/app/build.gradle.kts` derives both from it, so never edit Gradle) all read it.
  - `web/core/wp.js`: `WP.VERSION = 'X.Y.Z';` (the panel's last line shows it).
  - `web/wallpapers/jellyfin/jellyfin.js`: `static VERSION = 'X.Y.Z';` (the client version
    Jellyfin sees).
  - `SPEC.md`: the example in the Version bullet, `("Wallpapers X.Y.Z")`.
  Check with `git grep -nF '<old version>' -- web SPEC.md`: nothing should be left but
  unrelated mentions.
- `make test`, and note how many tests pass for the PR body.
- Commit subject: exactly `Version X.Y.Z` (`git log --oneline --grep '^Version'` shows the
  style). End the message with whatever attribution your agent's own instructions ask for in
  commits. The commit-msg hook audits the message, since it's public.
- Rebase onto the latest master (§R) first, then `git push -u origin HEAD`.
- `gh pr create --base master --title "Version X.Y.Z" --body "<body>"`. The body follows the
  repo's form:

  ```
  Version X.Y.Z: <one or two sentences on what this release brings, naming the PRs since the
  last tag (#75), or the user's summary if given>.

  Bumps manifest.json, WP.VERSION, the Jellyfin client version and the SPEC line. Unit tests
  pass (<n>).
  ```

  ending with the attribution your agent's instructions ask for in PRs, if any. The title
  matters: it becomes a line of the generated release notes.

## 2. Wait for the PR's CI to go green

- In the background: `gh pr checks <pr> --watch --fail-fast`. A PR runs four jobs: `ci`
  (`make ci`, then `make win-release`), `android` (`make android-build`), `mac` (`make mac-test`,
  `make mac-saver-test`, `make mac-release`) and `win` (`make win-test-zip` on Windows, against
  the zip `ci` built). `release` and `pages` are skipped on a PR; that's expected. Right after a
  push the checks may not be listed yet; if it says there are none, wait about 20 s in the
  background and run it again.
- **All pass:** go to §3.
- **Any fail:** go to §4 with the PR branch, then come back here. Each fix is a new commit on
  the same branch (no force-push, except after a rebase, §R), so the PR's history shows what
  CI made us change, and say so in the PR body: it's no longer a bump-only PR.
- **Give up after 3 fix rounds** on the PR, or if a failure isn't ours and isn't a flake (§4).
  Leave the PR open, and report what fails and why. The user decides.

## 3. Merge, tag

- `gh pr view <pr> --json mergeStateStatus,reviewDecision`. master isn't protected, so nothing
  stops a red merge but you: merge only when every check is green. If a review was requested
  and is missing, stop and say so: the PR is ready and waiting for a reviewer.
- Rebase onto the latest master (§R). If that changed anything, back to §2: CI has to pass on
  what will actually merge.
- `gh pr merge <pr> --merge --delete-branch` (a merge commit, as every PR here; no `--admin`,
  no squash). If it's refused because master moved in the meantime, §R again, then §2. Try at
  most 3 times, then report that master is moving too fast.
- `git checkout master && git pull --ff-only`.
- **Tag the merge commit, not whatever master is now:** `sha=$(gh pr view <pr> --json
  mergeCommit -q .mergeCommit.oid)`. Check that `web/manifest.json` at `$sha` says `X.Y.Z`
  (`git show $sha:web/manifest.json`): the release job's first step fails the run if the tag
  and the manifest disagree.
- If `vX.Y.Z` now exists on the remote (`git ls-remote --tags origin vX.Y.Z`), another agent
  took it. Never move it. Report the clash: your bump is merged, but it needs a new version,
  which is a follow-up `Version` PR (§1 to §3).
- `git tag vX.Y.Z $sha && git push origin vX.Y.Z` (a lightweight tag, like every earlier one;
  push only this tag, never `--tags`). The pre-push hook runs `make audit-history`'s scan;
  let it. If the push is refused because the tag appeared in the meantime, handle it as in the
  clash above.

## 4. Fixing what broke

For each failed run: `gh run view <id> --log-failed`, and find the real cause before changing
anything.

Decide whose it is:
- **Newly broken (ours):** it fails now but passed in the baseline, or it's in something this
  release's PR touched. Fix it.
- **Pre-existing:** it failed the same way in master's baseline run. Don't fix it as part of
  this release. Note it in the report, and don't let it block the merge decision on its own:
  if every failing job is pre-existing, stop and ask the user whether to merge anyway.
- **Flake:** it has nothing to do with the change, or it's a timeout, a runner or network
  error, a download (Gradle, NuGet, the WebView2 installer, Chocolatey's `make`), the Pages
  deploy's lagging artifact list, or `smoke-live` catching the CDN mid-update. Re-run it once:
  `gh run rerun <id> --failed`. Twice in a row means it's real; classify it again.

To fix:
1. Reproduce it locally with the matching make target, never raw `node`, `gradle`, `swift` or
  `dotnet`: CI calls the same targets. `ci` job: `make lint`, `make audit`, `make audit-history`,
  `make test`, `make smoke` (or `node tools/smoke.mjs <id>` for one wallpaper; screenshots in
  `dist/smoke/`), `make win-ci`, `make win-release`. `android`: `make android-build`. `mac`
  (needs a Mac): `make mac-test`, `make mac-saver-test`, `make mac-release`. `win` (needs
  Windows): `make win-test-zip`. If you can't run a platform's target here, read its log
  closely, fix, and let CI be the check.
2. Make the smallest fix that keeps the change's intent. Never weaken, skip or delete a test or
  a smoke check, loosen the audit, or add to its allowlist, to get green. If the test is right
  and the code is wrong, fix the code.
3. Run the target again until it passes locally, then `make ci`.
4. Commit (`<Area>: <what CI caught>`, the repo's style, e.g. `CI: …` or `Wayfarer: …`) and push
  to the PR branch, then back to §2.

## 5. After the merge: master and the release

Start both watches in the background, at the same time:
- **master CI:** `gh run list --workflow ci.yml --commit $sha --event push --json
  databaseId,headBranch` (the run whose headBranch is `master`; other agents' later commits
  have runs of their own), then `gh run watch <id> --exit-status`. Besides the four jobs it
  runs `pages`: it deploys the site to GitHub Pages and runs `make smoke-live` against it.
- **Release:** the same workflow, on the tag: `gh run list --workflow ci.yml --branch vX.Y.Z
  --json databaseId,headBranch,event` (headBranch is `vX.Y.Z`), then `gh run watch <id>
  --exit-status`. Its `release` job waits for `ci`, `android`, `mac` and `win`.

If a run isn't listed yet, wait about 20 s in the background and look again.

Then check what was published: `gh release view vX.Y.Z --json url,assets,body`. A full release
has six files: `wallpapers-X.Y.Z.apk`, `wallpapers-extension-X.Y.Z.zip`,
`wallpapers-mac-X.Y.Z.zip` and `wallpapers-windows-X.Y.Z.zip`, the last two each with a
`.sha256`. Leave the generated notes as they are; earlier releases were never edited.
- **The Mac zip is missing: always build it here and attach it, without asking** (the owner's
  standing order). On a Mac, in a fresh detached worktree at the tag
  (`git worktree add --detach <scratch dir> vX.Y.Z`): `make mac-test`, `make mac-saver-test`,
  then `make mac-release` (all in the background). It must say `arm64 x86_64`, and the zip's
  `shasum -a 256` must match its `.sha256`. Then `gh release upload vX.Y.Z
  dist/wallpapers-mac-X.Y.Z.zip dist/wallpapers-mac-X.Y.Z.zip.sha256`, check that the release
  lists six files, and remove the worktree. If the tests fail it's real breakage: don't upload,
  classify it as in §4 and report it. Not on a Mac: report that it must be attached by hand.
- **The Windows zip is missing:** by design (the `release` job's comment) the release still
  goes out when `mac` or `win` fails, with a warning. It isn't a failed release. Classify the
  failure as in §4 and report it; if it's ours, fix it through a PR and ship the next patch
  version, which will carry the missing zip.
- **`wallpapers-X.Y.Z-debug.apk` instead of the signed APK:** the `WALLPAPERS_KEYSTORE_*`
  secrets are missing. Report it; never try to sign some other way, and never touch the
  keystore (`~/.wallpapers-release.jks`, made once by `make android-keystore`).
- **No release at all** (`ci` or `android` failed on the tag, so `release` was skipped, or the
  tag/version check failed): if it's a flake, `gh run rerun <id> --failed` reruns it on the same
  tag. If it needs a code fix, never delete or move `vX.Y.Z`: take the fix through a PR (§1, §2,
  §4), then a `Version` PR for the next patch, and tag that once it's merged green. Report both
  versions.
- **master CI breaks, but the PR was green** (a merge interaction, a platform job, Pages or
  `smoke-live`): classify it as in §4. If it's newly broken, fix it on a new branch `fix-<what>`
  and take that through §1's PR flow, §2 and §4 as its own PR (merge it once green; no new tag
  unless something that ships is affected, in which case release the next patch).

## 6. Report

Keep it short:
- the PR URL, and how many fix rounds it took (what CI caught, if anything)
- rebases onto a moving master, any conflicts resolved, and a release abandoned to another
  agent's
- PR checks, master CI (with Pages and `smoke-live`) and the tag's run: each ✓ or ✗, with the
  run URL
- the release URL (`gh release view vX.Y.Z --json url -q .url`), and which of the six files it
  has: say plainly if the Mac or Windows zip is missing, or the APK is the debug build
- pre-existing failures you left alone, and anything still broken, with the exact error
