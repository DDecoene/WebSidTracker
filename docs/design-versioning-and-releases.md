# Versioning and releases, version 1

Status: design, not built yet. Companion to [the player format and timing model](design-player-format-and-timing.md) and [the web tracker architecture](design-web-tracker-architecture.md).

## 1. Intent

The formats will change as the player and the tracker grow. Someone who made a song months ago must still be able to open it. Today that is not guaranteed: only the project file has a `version` field and the code ignores it, the asm files and the player carry no version at all, and Pages always shows the latest `main`, so an old tracker no longer exists anywhere.

The aim: **a file never becomes unusable.** When a file is older than the tracker, the tracker says so and the user chooses between porting the file to the new version and continuing in the old tracker, which stays available.

## 2. Goals, non-goals, anti-goals

Goals
- Every file and every part carries a version, so the software always knows what it is looking at.
- A change to the format cannot go unnoticed: a test fails until the format version is raised and a migration exists.
- Every release is kept. The latest one is what people get by default; older ones stay reachable.
- Porting tells the user what would be lost before anything is changed.

Non-goals for the first release
- Opening `song_<name>.asm` or `instruments.asm` in the tracker. Only the project file (json) is opened. Reading the asm files comes in a later release (see 9); the design must not make it harder.
- Porting a newer file down to an older tracker.
- Automatic updates of games that already use an exported player.

Anti-goals
- Silent loss: a port that drops data without telling the user.
- A query parameter or other URL trick that the user has to know about to reach an old tracker.
- A build step, a bundler or a package manager for the web app. It stays plain files.

## 3. Two numbers

| Number | Looks like | Changes when | Used for |
|---|---|---|---|
| **Format version** | a whole number: 1, 2, 3 | the bytes or fields of any of the four formats change | deciding whether a file can be opened as it is, or must be ported |
| **Release version** | `0.4.2` (major.minor.patch) | a release is made | naming the tag, the GitHub release and the frozen copy on Pages |

*Decided:* the four formats share **one** format version: the project json, `song_<name>.asm`, `instruments.asm` and the player (`music.asm`, `player.prg`, `symbols.json`). If one of them changes, the number rises for all four.

A release version can rise without the format version rising (a bug fix, a new editor feature, a better sound in the player). The format version never falls.

Rule for the release version (*my call*): a rise of the format version makes it a new minor or major release; anything else can be minor or patch. The format version is the compatibility promise, the release version is only a name.

## 4. Where the numbers live

| Place | What is added |
|---|---|
| Project json | `version` already exists (value 1) and keeps its meaning: it is the format version. Added: `release`, the release version of the tracker that wrote it. |
| `song_<name>.asm`, `instruments.asm` | a comment line at the top, for example `; websidtracker format 2, release 0.3.0`. A comment, so the bytes the player sees do not change. |
| `music.asm` | the same comment line, and two constants (`FORMAT_VERSION`, `RELEASE`) in the source. |
| `web/player/symbols.json` | four numeric labels, `format_version`, `release_major`, `release_minor`, `release_patch`, written by `tools/build-player.sh` from the constants in `music.asm` (the file is a flat label to number map, so no string field). |
| The tracker | one source of truth, a small module `web/version.js`, exporting `FORMAT` and `RELEASE`. The header shows the release. |

The exported `.prg` is not given a version field of its own (*my call*): it is the player image plus data, and the player image already carries the constants.

## 5. Noticing that the format changed

A test makes it impossible to change a format by accident.

**Golden files.** For each format version the repository keeps a fixed set of reference files in `web/model/golden/format-<n>/`: a project json, the exported `song_<name>.asm` and `instruments.asm`, and the serialised song bytes, all made from one fixed example project. A test builds the same files with the current code and compares them byte for byte with the golden set of the *current* format version. If they differ, the test fails with a message saying: raise the format version, add a migration and a new golden set, or undo the change.

**Migration test.** The golden sets of the older versions stay. A second test loads each of them through the migrations and checks that it ends as the current project, apart from the losses the migration has declared.

**Player fingerprint.** A third test takes a hash of what defines the player's format: the instrument table names and order, the event codes, the header size, and the state block symbols in `symbols.json`. The expected hash is stored with the format version. A change in the hash without a new format version fails the test. Bug fixes and sound changes in the player do not change the fingerprint.

**What the tests cannot see.** If the bytes stay the same but their meaning changes (for example how a release value is interpreted), no test fails. That stays a point for review, and `docs/player.md` says so.

## 6. Opening an older file

Applies to the project json opened from disk and to the autosave in the browser.

1. The tracker reads `version` from the file (a file without one is format 1, the only format that exists today).
2. **Same as the tracker:** it opens as it does now.
3. **Newer than the tracker:** it refuses with a message that says which format the file has and that a newer tracker is needed. The old tracker never guesses.
4. **Older than the tracker:** it opens a dialog. Before anything is changed it has run the migrations as a dry run, in memory, and checked the result with the validation the tracker already has. The dialog shows:
   - the format of the file and of the tracker,
   - a list of what would be lost or changed, in plain words (for example "instrument 5: field X is no longer used" or "pattern 3 is 270 bytes, the limit is 255"), or "nothing is lost",
   - two choices: **Port to version N** and **Open in the old tracker (release R)**.
5. **Port:** the migrated project is loaded as an unsaved project. The original file on disk is never touched; saving creates a new file.
6. **Old tracker:** the tracker finds the newest release that has the file's format (see 7), stores the file where that release can pick it up (see below) and navigates to it.

**Handing the file over.** The page of the old release is on the same origin, so the tracker puts the project text in `sessionStorage` under the key `websidtracker.handover` and navigates to the frozen copy. On start every release looks for that key, loads and removes it. This is a contract: **every release from the first one on must read `websidtracker.handover`**, because a released copy can never be changed afterwards. No query parameter is involved.

**Autosave.** The autosave already lives in `localStorage` under a key with `v1` in it. The autosave text carries the format version like any project, and the rules above apply on start. A frozen old release that meets an autosave with a newer format ignores it and does not overwrite it (*my call*).

**Edge cases.** *My calls:* if `releases.json` cannot be fetched (offline, `file://`, a dev server) or no release has the file's format, the dialog offers only **Port** and says why the other choice is missing. The project being worked on is autosaved before either choice, so nothing is lost by leaving the page; Port replaces the current project only after the user confirms it, and the autosave still holds the previous one.

**Format 1.** Every project file written so far says `version: 1` (the field has been there since the first export) and the loader fills in fields that older files lack. So format 1 is the shape the first release reads, including that tolerance, and the golden set of format 1 is made from the current code.

**Migrations.** A migration is a pure function from format n to n+1 that returns the new project and a list of losses. They are chained: a format 1 file reaches format 4 through 1→2, 2→3, 3→4. They live in `web/model/migrate.js`. The list of losses is the same list that the dialog shows. The first release has no migrations.

## 7. Releases and Pages

**Branches (gitflow).**

| Branch | Purpose |
|---|---|
| `develop` | daily work; feature branches (`feature/<topic>`) start from it and return to it |
| `main` | releases only; every commit on it is the merge of a release or hotfix branch and carries the tag `v<release>` |
| `release/<release>` | starts from `develop`; only the version numbers and last fixes go in; merged into `main` (tagged) and back into `develop` |
| `hotfix/<topic>` | starts from `main` for an urgent fix; merged into `main` (new patch tag) and back into `develop` |

*My calls:* there are no support branches for old releases: an old release gets no fixes, the frozen copy and the porting are the answer. This is a working agreement, not enforced; GitHub branch protection can be added later.

**Making a release.** The maintainer makes `release/<release>` from `develop`, raises the version numbers (see below), merges it into `main` and tags the merge `v<release>` (for example `v0.3.0`). Pushing the tag starts a workflow that:
1. runs the tests,
2. creates a GitHub release for the tag,
3. publishes Pages as: the latest tracker in the root, plus a frozen copy of every release under `/v<release>/` (for example `/v0.3.0/`), plus the current `develop` under `/dev/`,
4. writes `releases.json` in the root: the list of releases with their format version.

A published release never changes. The root is always a release, never work in progress. A push to `develop` also runs the workflow. GitHub Pages deploys a whole site at once, so every run assembles the complete site again: the root and the frozen copies are rebuilt from the tags (identical every time), `/dev/` from `develop`. `/dev/` shows a clear "development version" bar and uses its own `localStorage` autosave key (*my call*), so work in it cannot overwrite the autosave of a release.

**Which release for which file.** For a file with format F the tracker takes the newest release in `releases.json` whose format is F. That gives bug fixes of that format, not just the exact release that wrote the file.

**What a copy contains.** The whole `web/` folder (landing page, tracker, manual), so a frozen release is complete and its manual matches its behaviour. The root is a copy of the `web/` of the latest tag on `main`. `workflow_dispatch` stays, to republish by hand.

**Tag and number must agree.** The release number is committed in `web/version.js`, `src/music.asm`, `web/player/symbols.json` and the asm export comments before the tag is made. The workflow fails when the tag differs from `RELEASE`; it never stamps a number into a copy, because a frozen copy must be exactly the tagged commit. `player.prg` and `symbols.json` stay committed (built with `make player`), so CI needs no assembler.

**Frozen copies work in a subfolder.** The app already loads its files relative to its own location (`import.meta.url`), so a copy under `/v0.3.0/` needs no change. Frozen copies are never edited after publishing.

**Downloads.** The GitHub release contains, for the player: `music.asm`, `player.prg` and `symbols.json`, so a game developer can pin a player version too (*my call*).

## 8. First release

The state of `main` when this design is built becomes **`v0.1.0`, format 1**. The project is in alpha, hence a 0.x release; the format version is separate from it and stays 1, because project files already say so. It contains the whole mechanism that cannot be added later: the version fields, `web/version.js`, reading `websidtracker.handover`, refusing newer formats, and the empty migration list. `README.md`, `docs/tracker-guide.md`, `docs/player.md` and `web/README.md` describe the versioning, the branches and how to make a release. Getting there: `develop` is created from the current `main`, the version mechanism is built on `develop`, and then `release/0.1.0` goes through the normal steps.

## 9. Later

- Opening `song_<name>.asm` and `instruments.asm` (the asm parser) with the same dialog. The comment line of section 4 is what identifies the format there.
- NTSC and other player changes will use the same mechanism.

## 10. Left to the builder

- The exact wording of the dialog and the loss messages.
- The layout of `releases.json` and the workflow details (for example how the frozen copies are built from the tags).
- The contents of the example project for the golden files, as long as it uses every kind of event and every instrument field.
- Tests run headless in Node, like the existing `.test.mjs` files; the fingerprint reads the committed `symbols.json`.
- The exact set of things in the player fingerprint, as long as a change in any layout-defining part changes it.

## 11. Constraints

- Plain files, no build step for the web app; the workflow may copy and assemble files.
- Nothing in the repository, a commit message or a release mentions the tools used to write it. Nothing is pushed until the maintainer says so.
- Licences stay as they are: `web/` GPL, `src/` and the exported files MIT.
