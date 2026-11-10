# Versions and releases

Design and reasons: [design-versioning-and-releases.md](design-versioning-and-releases.md). This page is the checklist.

## Two numbers

- **Format version** (`FORMAT` in `web/version.js`): one whole number for the project json, `song_<name>.asm`, `instruments.asm` and the player. It rises only when one of those formats changes, and never falls. It is also in `src/music.asm` (`format_version`) and in every exported file.
- **Release version** (`RELEASE` in `web/version.js`, `major.minor.patch`): the name of a release. It is also in `src/music.asm` (`release_major`, `release_minor`, `release_patch` and the comment line at the top). A test (`web/version.test.mjs`) fails when they disagree.

## Branches

| Branch | Purpose |
|---|---|
| `develop` | daily work; feature branches (`feature/<topic>`) start from it and go back into it |
| `main` | releases only; every commit on it is the merge of a release or hotfix branch, tagged `v<release>` |
| `release/<release>` | starts from `develop`; only version numbers and last fixes; merged into `main` and back into `develop` |
| `hotfix/<topic>` | starts from `main` for an urgent fix; merged into `main` (new patch tag) and back into `develop` |

An old release gets no fixes: its frozen copy stays on Pages, and an old project file can be ported.

## Making a release

1. `git switch develop && git switch -c release/<release>`
2. Raise the numbers: `RELEASE` in `web/version.js`; `release_major`, `release_minor`, `release_patch` and the comment line in `src/music.asm`. Then `make player` (it regenerates `web/player/symbols.json`).
3. Run the tests (README, "Running the tests"). `web/version.test.mjs` checks that the numbers agree.
4. `git switch main && git merge --no-ff release/<release>`, then `git tag -a v<release> -m "v<release>"`.
5. `git switch develop && git merge --no-ff main`.
6. Push `main`, `develop` and the tag. The tag starts the workflow: tests, a check that the tag equals `RELEASE`, a GitHub release (with `music.asm`, `player.prg`, `symbols.json`) and the Pages site.

## When the format changes

The golden test (`web/model/golden.test.mjs`) fails when the bytes or fields of any format change. Then either undo the change, or:

1. Raise `FORMAT` in `web/version.js` and `format_version` in `src/music.asm`; `make player`.
2. Add a migration to `MIGRATIONS` in `web/model/migrate.js`: `MIGRATIONS[n - 1]` takes the data of format n to n + 1 and returns `{ data, losses }`; `losses` says in plain words what could not be kept.
3. Make the new golden set: `node web/model/golden/make.mjs <FORMAT>`. The older sets stay: the tests run them through the migrations.
4. This is a new minor (or major) release.

The test cannot see a change of *meaning* where the bytes stay the same; that is a point for review.

## The site on Pages

- Root: the newest release (a copy of `web/` at the newest tag). `/v<release>/`: every release, never changed. `/dev/`: the `develop` branch, with a "development version" bar and its own autosave. `releases.json` in the root lists the releases with their format.
- Every run of the workflow builds the whole site again from the tags on `main` (`node tools/release-tools.mjs assemble site --main-ref origin/main`). A tag that is not on `main`, or whose `web/version.js` names another release, is left out with a warning.
- The GitHub release is made by a separate workflow (`release.yml`), so a queued or cancelled site run never loses it.
- One setting on GitHub is needed: Settings → Environments → `github-pages` → Deployment branches and tags must allow the branch `develop` and the tags `v*`.

## Autosave

Every format has its own key in the browser (`websidtracker.autosave.v<format>`, for `/dev/` `websidtracker.dev.autosave.v<format>`). A release reads its own key and the keys of older formats, never newer ones. Keep that when you add a format.

## What the tracker does with an older file

It asks: port to the new version (after listing what would be lost) or open in the old tracker (the newest release that has the file's format, on the same site). A file from a newer format is refused with a message. See the tracker guide.
