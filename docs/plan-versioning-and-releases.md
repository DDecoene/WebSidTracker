# Versioning and releases: implementation plan

**Goal:** every file and part of WebSidTracker carries a format version and a release version, a test stops format changes from slipping through, older project files can be ported (after a loss report) or opened in the frozen older tracker, and Pages serves the latest release with every release kept.

**Architecture:** one module `web/version.js` holds the two numbers and the small pure helpers around them; `web/model/` gets the format check, the migration chain and the golden-file tests; `web/app/` gets the hand-over, the release lookup and the dialog; `tools/release-tools.mjs` and a rewritten Pages workflow build the site from the git tags.

**Tech stack:** plain ES modules, Node 22 `node --test` (as the existing tests), ACME for the player, GitHub Actions. No new dependencies.

**Spec:** [design-versioning-and-releases.md](design-versioning-and-releases.md)

## Global constraints

- Format version is one whole number shared by the project json, `song_<name>.asm`, `instruments.asm` and the player. It is `1` now and never falls.
- Release version is `major.minor.patch`; the first release is `0.1.0`, tag `v0.1.0`.
- No build step, bundler or package manager for `web/`. No new runtime dependency.
- The handover key is `sessionStorage` `websidtracker.handover`. Every release reads it from the first release on. No query parameter selects a version.
- A frozen copy is exactly the tagged commit: nothing is stamped into it afterwards.
- Licences: `web/` GPL-3.0-or-later (header comment on new files as the existing ones), `src/` and `tools/` MIT. Existing file header style applies.
- Commit messages are plain and carry no attribution trailer. Small separate commits. **Nothing is pushed** until the maintainer says so.
- Tests run headless in Node. Existing tests keep passing after every task (the full list is in the README section "Running the tests").

## Review focus

Inputs the spec implies but its main flow does not spell out. Each has a test in the task named.

1. A project file whose `version` is missing (means format 1), `0`, negative, `1.5` or a string: missing is format 1, the rest is "not a project file", never a crash or a port attempt. (Task 3)
2. A newer file meets an older tracker (a frozen release, or an autosave written by a newer release): refused with a clear message, and the autosave is not overwritten. (Tasks 3, 6)
3. Storage that throws (`sessionStorage` blocked): "Open in the old tracker" is shown as unavailable with the reason; nothing crashes. (Tasks 5, 6)
4. A migration that produces a project failing `validate`: the dialog lists the problems, Port is unavailable, the old tracker stays available. (Tasks 3, 6)
5. A handover text that is damaged, or left over from an earlier visit: the key is removed whatever happens, the tracker starts normally with a message, and a reload does not open it again. (Tasks 5, 6)

## File structure

| File | Responsibility |
|---|---|
| `web/version.js` (new) | `FORMAT`, `RELEASE`, storage keys, semver helpers, `siteRoot`, `isDevChannel`, `autosaveKeyFor`, `pickRelease` |
| `web/model/format.js` (new) | `readFormat`, `NewerFormatError`, `OlderFormatError` |
| `web/model/migrate.js` (new) | `MIGRATIONS` chain, `inspectProject` (dry run with loss list) |
| `web/model/export.js` (modify) | version line in asm exports, `release` in json, `projectFromData`, strict `projectFromJson` |
| `web/model/serialise.js` (modify) | export `EVENT_CODES` |
| `web/model/fingerprint.js` (new) | `formatFingerprint` |
| `web/model/golden/` (new) | `example.js` (fixed example project), `make.mjs` (writes a golden set), `format-1/` (the set) |
| `web/model/golden.test.mjs`, `web/model/migrate.test.mjs`, `web/version.test.mjs` (new) | tests |
| `web/app/handover.js`, `web/app/releases.js`, `web/app/upgrade.js`, `web/app/upgrade-dialog.js` (new) | hand-over, release lookup, dialog text and DOM |
| `web/app/main.js`, `web/tracker.html`, `web/style.css` (modify) | wiring, release label, dev bar, dialog markup |
| `src/music.asm`, `tools/labels-to-json.py`, `web/player/symbols.json` (modify) | player constants |
| `tools/release-tools.mjs`, `tools/release-tools.test.mjs` (new) | tag check, releases.json, site assembly |
| `.github/workflows/pages.yml` (rewrite) | test, GitHub release, assemble, deploy |
| README, `docs/*.md`, `web/README.md`, `docs/releasing.md` (new) | documentation |

---

### Task 1: version module

**Files:** create `web/version.js`, `web/version.test.mjs`. Work on branches: `git switch main && git switch -c develop && git switch -c feature/versioning`.

**Interfaces — produces:**
```js
export const FORMAT = 1;                       // number
export const RELEASE = '0.1.0';                // string
export const HANDOVER_KEY = 'websidtracker.handover';
export const AUTOSAVE_KEY = 'websidtracker.autosave.v1';       // same key in every release
export const DEV_AUTOSAVE_KEY = 'websidtracker.dev.autosave';
export function parseSemver(text: string): [number, number, number] | null  // only plain X.Y.Z
export function compareSemver(a: string, b: string): number                // <0, 0, >0
export function siteRoot(pathname: string): string
export function isDevChannel(pathname: string): boolean
export function autosaveKeyFor(pathname: string): string
export function pickRelease(releases: {release: string, format: number}[], format: number): {release: string, format: number} | null
```

- [ ] **Step 1: write the failing tests** in `web/version.test.mjs`: `parseSemver('1.2.3')` is `[1,2,3]`; `parseSemver('1.2')`, `'v1.2.3'`, `'1.2.3-rc1'` are `null`; `compareSemver('0.10.0','0.9.0') > 0`; `siteRoot` maps `/WebSidTracker/tracker.html`, `/WebSidTracker/v0.1.0/tracker.html`, `/WebSidTracker/dev/`, `/WebSidTracker/` all to `/WebSidTracker/`, and `/tracker.html` and `/` to `/`; `isDevChannel('/WebSidTracker/dev/tracker.html')` true, `'/WebSidTracker/tracker.html'` false; `autosaveKeyFor` returns `DEV_AUTOSAVE_KEY` for dev paths else `AUTOSAVE_KEY`; `pickRelease` of `[{0.1.0,1},{0.2.0,1},{0.3.0,2}]` for format 1 is `0.2.0`, for format 3 is `null`.
- [ ] **Step 2:** run `node --test web/version.test.mjs`; expect FAIL (module missing).
- [ ] **Step 3:** implement `web/version.js` to the signatures above, GPL header comment like `web/app/files.js`.
- [ ] **Step 4:** run the test; expect PASS.
- [ ] **Step 5:** commit `web: version module with the format and release numbers`.

### Task 2: version stamps in exports and the player

**Files:** modify `web/model/export.js`, `src/music.asm`, `tools/labels-to-json.py`, `web/player/symbols.json` (regenerated by `make player`), `web/model/test.mjs` (only if an existing assertion breaks); test in `web/version.test.mjs`.

**Interfaces — consumes:** `FORMAT`, `RELEASE`. **Produces:** `export function versionLine(format = FORMAT, release = RELEASE): string` in `export.js` returning `; websidtracker format 1, release 0.1.0`.

- [ ] **Step 1: failing tests** in `web/version.test.mjs`:
  - `exportInstrumentsAsm(...)` and `exportSongAsm(...)` start with `versionLine()` as their first line... for the song file the first line stays `; song_<id>.asm - generated...` and `versionLine()` is the second line; for instruments the same (second line). State this in the test.
  - `JSON.parse(projectToJson(project))` has `version === FORMAT` and `release === RELEASE`.
  - `symbols.json` has `format_version === FORMAT` and `release_major/minor/patch` equal to the parts of `RELEASE`.
  - `src/music.asm` contains the text `; websidtracker format ${FORMAT}, release ${RELEASE}` and the lines `format_version = ${FORMAT}`, `release_major = …`, `release_minor = …`, `release_patch = …`.
- [ ] **Step 2:** run; expect FAIL.
- [ ] **Step 3:** implement. `projectToJson` writes `{ format, version: FORMAT, release: RELEASE, instruments, song }`. In `music.asm` add the version comment line and the four constants in section [1] (names exactly as in the test). `labels-to-json.py`: extend `KEEP` with `^(format_version|release_(major|minor|patch))$`. The spec said `symbols.json` gets `format` and `release` fields; the file is a flat label→number map that tests index by name, so the plan uses these four numeric labels instead (update the spec table in Task 8).
- [ ] **Step 4:** `make player`, then run `node --test web/version.test.mjs web/model/test.mjs web/player/test.mjs`; expect PASS. `git diff web/player/player.prg` must show no change (constants only).
- [ ] **Step 5:** commit `web, player: format and release stamps in the exports and the player`.

### Task 3: format check and the migration chain

**Files:** create `web/model/format.js`, `web/model/migrate.js`, `web/model/migrate.test.mjs`; modify `web/model/export.js`.

**Interfaces — produces:**
```js
// format.js
export class NewerFormatError extends Error { format: number; release: string | null }
export class OlderFormatError extends Error { format: number }
export function readFormat(data: object): number   // missing version → 1; otherwise a positive integer or throws Error('This is not a project file (bad version).')
// export.js
export function projectFromData(data: object): Project      // the part of projectFromJson after JSON.parse: defaults and validate, no version check
export function projectFromJson(text: string): Project      // now: readFormat; > FORMAT throws NewerFormatError; < FORMAT throws OlderFormatError; else projectFromData
// migrate.js
export const MIGRATIONS: Array<(data: object) => { data: object, losses: string[] }>   // MIGRATIONS[n-1] takes format n to n+1; empty now
export function inspectProject(text: string, options?: { format?: number, migrations?: typeof MIGRATIONS }):
  | { status: 'current', project: Project }
  | { status: 'older', fromFormat: number, release: string | null, project: Project | null, losses: string[], problems: string[] }
// throws NewerFormatError, or Error for text that is not a project file
```
`project` is `null` and `problems` lists the `validate` messages when the migrated result is invalid; `problems` is `[]` otherwise.

- [ ] **Step 1: failing tests** in `migrate.test.mjs` using injected `format: 2` and a fake `migrations: [(d) => ({ data: { ...d, song: { ...d.song, speed: 6 } }, losses: ['speed reset to 6'] })]`:
  - format-1 text with `format: 2` injected gives `status: 'older'`, `fromFormat: 1`, the losses, `project.song.speed === 6`.
  - text with the current format gives `status: 'current'`.
  - `version: 3` with `format: 2` throws `NewerFormatError` with `format === 3`.
  - Review focus 1: no `version` → treated as 1; `version: 0`, `-1`, `1.5`, `'1'` throw the "not a project file" error.
  - Review focus 4: a fake migration returning a song with `speed: 999` gives `project === null` and a non-empty `problems`.
  - chained: two fake migrations 1→2→3 run in order and their losses are concatenated.
  - `projectFromJson` with the real `FORMAT` still opens a normal file and throws `NewerFormatError` for `version: FORMAT + 1`.
- [ ] **Step 2:** run `node --test web/model/migrate.test.mjs`; expect FAIL.
- [ ] **Step 3:** implement. `inspectProject` parses JSON (same error text as today for invalid JSON), reads the format, walks the chain, validates once at the end with `projectFromData`, catching its error into `problems`.
- [ ] **Step 4:** run `node --test web/model/migrate.test.mjs web/model/test.mjs web/app/*.test.mjs`; expect PASS.
- [ ] **Step 5:** commit `web: format check and migration chain for project files`.

### Task 4: golden files and the format fingerprint

**Files:** modify `web/model/serialise.js` (export `EVENT_CODES = { rest: 0x60, inst: 0x61, legato: 0x62, end: 0xFF, orderStop: 0xFE, orderLoop: 0xFF }` built from the existing constants); create `web/model/fingerprint.js`, `web/model/golden/example.js`, `web/model/golden/make.mjs`, `web/model/golden/format-1/*`, `web/model/golden.test.mjs`.

**Interfaces — produces:**
```js
// golden/example.js
export function goldenProject(): Project       // fixed data: uses every event type ('note', 'rest', 'inst', 'legato'), loop and stop order entries, a negative transpose, and sets every instrument field to a non-default value on at least one instrument
// fingerprint.js
export function formatFingerprint(symbols: object): string   // 64 hex chars (SHA-256, node:crypto) of canonical JSON containing: INSTRUMENT_TABLES in order, EVENT_CODES, HEADER_SIZE, st_voice_size, every st_* symbol as [name, address - lowest st_* address] sorted by name, every inst_* symbol as [name, address]
// make.mjs
// usage: node web/model/golden/make.mjs <format>  → writes web/model/golden/format-<format>/{project.json, instruments.asm, song_golden.asm, song.bin, fingerprint.txt}
```

- [ ] **Step 1: failing tests** in `golden.test.mjs`:
  - for the directory `golden/format-${FORMAT}`: build `projectToJson(goldenProject())`, `exportInstrumentsAsm`, `exportSongAsm(song, 'golden')` and `serialiseSong(song, 0x3000).bytes`, and compare with the files, after replacing `release \d+\.\d+\.\d+` and `"release": "…"` by a fixed `0.0.0` on both sides (a release bump must not fail the test). Failure message: `the format changed: raise FORMAT in web/version.js, add a migration and a new golden set (node web/model/golden/make.mjs <n>), or undo the change`.
  - `formatFingerprint(symbols.json)` equals `fingerprint.txt`, same message.
  - every older `golden/format-<n>` (n < FORMAT) loads through `inspectProject` and its project equals `goldenProject()` apart from fields named in the returned `losses` (loop is empty today; add a test of this loop body with a temporary in-memory fake so the logic itself is exercised).
  - `goldenProject()` covers every instrument field: assert that for each key of `defaultInstrument()` at least one instrument differs from the default.
- [ ] **Step 2:** run; expect FAIL.
- [ ] **Step 3:** implement `EVENT_CODES`, `fingerprint.js`, the example and `make.mjs`; run `node web/model/golden/make.mjs 1`.
- [ ] **Step 4:** run `node --test web/model/golden.test.mjs`; expect PASS. Then prove the guard: temporarily change `EV_REST` in `serialise.js` to `0x63`, run again, expect FAIL with the message; revert with `git checkout web/model/serialise.js` plus the `EVENT_CODES` edit kept (re-run tests: PASS).
- [ ] **Step 5:** commit `web: golden files and a fingerprint that catch format changes`.

### Task 5: hand-over and release lookup

**Files:** create `web/app/handover.js`, `web/app/releases.js`, `web/app/handover.test.mjs`, `web/app/releases.test.mjs`.

**Interfaces — consumes:** `HANDOVER_KEY`, `siteRoot`, `pickRelease`. **Produces:**
```js
// handover.js — `storage` is anything with getItem/setItem/removeItem
export function putHandover(storage, text: string): boolean      // false when the storage throws
export function takeHandover(storage): string | null              // returns the text; removes the key always; null when absent or the storage throws
// releases.js
export async function loadReleases(root: string, fetchFn = fetch): Promise<{release: string, format: number}[] | null>   // GET `${root}releases.json`; null on any failure or wrong shape; shape {"releases":[{release,format}]}
export function frozenUrl(root: string, release: string, file = 'tracker.html'): string      // `${root}v${release}/${file}`
```

- [ ] **Step 1: failing tests:** put then take returns the text and a second take returns `null` (Review focus 5); take removes the key even when the text is empty; a storage whose `setItem` throws makes `putHandover` return `false` and a storage whose `getItem` throws makes `takeHandover` return `null` (Review focus 3); `loadReleases` with a fake `fetchFn` returning a valid body returns the list, returns `null` for HTTP 404, for invalid JSON, and when `fetchFn` rejects; `frozenUrl('/WebSidTracker/', '0.1.0')` is `/WebSidTracker/v0.1.0/tracker.html`.
- [ ] **Step 2:** run `node --test web/app/handover.test.mjs web/app/releases.test.mjs`; expect FAIL.
- [ ] **Step 3:** implement to the signatures.
- [ ] **Step 4:** run; expect PASS.
- [ ] **Step 5:** commit `web: hand a file to another release and look up releases`.

### Task 6: dialog, wiring and the dev channel

**Files:** create `web/app/upgrade.js`, `web/app/upgrade.test.mjs`, `web/app/upgrade-dialog.js`; modify `web/app/main.js`, `web/tracker.html`, `web/style.css`.

**Interfaces — consumes:** `inspectProject`, `NewerFormatError`, `putHandover`, `takeHandover`, `loadReleases`, `pickRelease`, `frozenUrl`, `siteRoot`, `autosaveKeyFor`, `isDevChannel`, `FORMAT`, `RELEASE`. **Produces:**
```js
// upgrade.js (pure)
export function describeUpgrade(info: { fromFormat: number, release: string | null, losses: string[], problems: string[], project: object | null },
                                env: { currentFormat: number, currentRelease: string, oldRelease: string | null, canHandOver: boolean }):
  { heading: string, summary: string, losses: string[], problems: string[],
    port: { enabled: boolean, reason: string | null }, old: { enabled: boolean, reason: string | null, release: string | null } }
// upgrade-dialog.js (DOM)
export function askUpgrade(dialog: HTMLDialogElement, description): Promise<'port' | 'old' | 'cancel'>
```
`summary` states both formats and the release that wrote the file; `losses` empty is rendered as "Nothing is lost." by the dialog. `port.enabled` is false when `info.project` is `null` (reason: the problems); `old.enabled` is false when `oldRelease` is `null` (reason: no release with this format is known, or none could be loaded) or `canHandOver` is false (reason: the browser blocks storage).

- [ ] **Step 1: failing tests** in `upgrade.test.mjs`: losses and problems are passed through; `project: null` disables port with a reason mentioning the problems and keeps old enabled (Review focus 4); `oldRelease: null` disables old and keeps port enabled; `canHandOver: false` disables old with a reason (Review focus 3); both formats and the writing release appear in `summary`.
- [ ] **Step 2:** run `node --test web/app/upgrade.test.mjs`; expect FAIL.
- [ ] **Step 3:** implement `describeUpgrade`; implement `askUpgrade` over a `<dialog id="upgrade-dialog">` (heading, summary paragraph, loss list, three buttons Port / Open in old tracker / Cancel, disabled buttons show their reason as title and text) added to `tracker.html` with styles in `style.css` next to the existing dialog styles.
- [ ] **Step 4: wire `main.js`:**
  - Use `AUTOSAVE_KEY` from `version.js`, but read the key through `autosaveKeyFor(location.pathname)` so the dev copy has its own.
  - Start order: `takeHandover(sessionStorage)` first (a project text, parsed with `projectFromJson`; on any error show a message and fall through, Review focus 5), then the `?demo=` link, then the autosave, then the first-start demo.
  - The autosave read at start goes through `inspectProject`: `current` as now; `older` starts from the first-start demo with `autosaveHeld = true`, then shows the dialog once the page is ready; `NewerFormatError` starts from the demo, sets `autosaveHeld = true` and shows a message that a newer release wrote the autosave (Review focus 2).
  - The Open button goes through `inspectProject` too: `older` shows the dialog; `NewerFormatError` shows an error naming the file's format and saying a newer tracker is needed; the current project stays unchanged.
  - Dialog results: **port** → `replaceProject(info.project, …)` then force it to count as unsaved (`savedJson = ''`) so Save/closing warns; **old** → `persist(store.project)` (unless held), `putHandover(sessionStorage, originalText)`, `location.assign(frozenUrl(siteRoot(location.pathname), oldRelease))`; **cancel** → nothing changes.
  - `oldRelease` comes from `pickRelease(await loadReleases(siteRoot(location.pathname)), info.fromFormat)`; `canHandOver` from a trial `putHandover` write/removal.
  - Show `RELEASE` in the header (`<span id="release">`); when `isDevChannel(location.pathname)` show a bar "Development version, not a release" and prefix the title.
- [ ] **Step 5: verify in a browser** (the dialog is DOM and has no Node test). Temporarily, uncommitted: set `FORMAT = 2` in `web/version.js` and add one fake migration 1→2 to `MIGRATIONS` that drops one instrument field and reports it as a loss. Build a scratch site: `mkdir -p $SCRATCH/site && cp -R web/. $SCRATCH/site/ && mkdir $SCRATCH/site/v0.1.0 && git archive HEAD web | tar -x -C $SCRATCH/x && cp -R $SCRATCH/x/web/. $SCRATCH/site/v0.1.0/` and write `$SCRATCH/site/releases.json` as `{"releases":[{"release":"0.1.0","format":1}]}`. Serve it (`python3 -m http.server`) and with the browser tools check: (a) opening a saved format-1 json shows the dialog with the loss; Port loads it unsaved; (b) "Open in old tracker" lands on `/v0.1.0/tracker.html` with the project loaded; (c) a hand-made json with `"version": 3` is refused and the current project is unchanged; (d) with `releases.json` removed the dialog offers only Port. Then `git checkout web/version.js web/model/migrate.js`.
- [ ] **Step 6:** run all `node --test` lines of the README; expect PASS. Commit in two steps: `web: dialog text for opening an older project file` (upgrade files), `web: ask before opening older files; release label and development bar` (wiring).

### Task 7: release tooling and the Pages workflow

**Files:** create `tools/release-tools.mjs`, `tools/release-tools.test.mjs`; rewrite `.github/workflows/pages.yml`.

**Interfaces — consumes:** `compareSemver`, `parseSemver` from `web/version.js`. **Produces:**
```js
export function parseVersionJs(text: string): { format: number, release: string }     // reads `export const FORMAT = n;` and `export const RELEASE = 'x.y.z';`
export function releaseTags(tags: string[]): string[]                                  // only plain vX.Y.Z, sorted oldest first
export function buildReleasesJson(entries: { release: string, format: number }[]): string   // {"releases":[…]} newest first, 1 space indent, trailing newline
export function checkTag(tag: string, release: string): void                         // throws unless tag === `v${release}`
// CLI:  node tools/release-tools.mjs check-tag <tag>        (reads RELEASE from web/version.js)
//       node tools/release-tools.mjs assemble <outDir> [--dev-ref origin/develop]
```
`assemble`: for each tag from `git tag --list 'v*'` (filtered by `releaseTags`), `git archive <tag> web` is extracted to `<outDir>/v<release>/`; the root is the same content as the newest tag; with no tags the root is `--dev-ref`'s content (so the site works before the first release); `<outDir>/dev/` is the content of `--dev-ref` when that ref exists; `releases.json` is built from `parseVersionJs(git show <tag>:web/version.js)` of every tag.

- [ ] **Step 1: failing tests:** `parseVersionJs` on the real `web/version.js` text; `releaseTags(['v0.2.0','v0.1.0','v0.1.0-rc1','latest','v0.10.0'])` is `['v0.1.0','v0.2.0','v0.10.0']`; `buildReleasesJson` orders newest first; `checkTag('v0.1.0','0.1.0')` passes and `checkTag('v0.2.0','0.1.0')` throws a message naming both. One integration test: in a temp git repository (created with `git init` in `os.tmpdir()`) with `web/version.js` committed and tagged `v0.1.0`, `assemble` produces `v0.1.0/version.js`, the root copy, `releases.json`, and `dev/` for `--dev-ref HEAD`.
- [ ] **Step 2:** run `node --test tools/release-tools.test.mjs`; expect FAIL.
- [ ] **Step 3:** implement with `node:child_process` `execFileSync` (no shell strings).
- [ ] **Step 4:** run; expect PASS.
- [ ] **Step 5: workflow.** Rewrite `pages.yml`: triggers `push` on tags `v*.*.*` and on branch `develop` (paths `web/**`, `src/**`, `tools/**`, the workflow), plus `workflow_dispatch`. `permissions`: `contents: write`, `pages: write`, `id-token: write`. Steps: checkout with `fetch-depth: 0` and tags; Node 22; run the README `node --test` lines (including `node web/sid/test.mjs`, which is plain Node; not the 6502 suites that need `fetch-tests.sh`); on tag pushes `node tools/release-tools.mjs check-tag "$GITHUB_REF_NAME"`; on tag pushes `gh release create "$GITHUB_REF_NAME" src/music.asm web/player/player.prg web/player/symbols.json --title "$GITHUB_REF_NAME" --generate-notes`; `node tools/release-tools.mjs assemble site`; `actions/upload-pages-artifact` with `path: site`; `actions/deploy-pages`. Keep the `concurrency: pages` group (without cancelling in-progress runs) and the `github-pages` environment. Validate the YAML with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pages.yml'))"`, and run `node tools/release-tools.mjs assemble $SCRATCH/site --dev-ref HEAD` locally in the repository, checking the folder layout.
- [ ] **Step 6:** commit `tools: build the site from the release tags` (tooling + test) and `ci: publish tagged releases, the frozen copies and the develop preview` (workflow).
- [ ] **Step 7: tell the maintainer** (do not do it): in the repository settings, Environments → github-pages → Deployment branches and tags must allow branch `develop` and tags `v*`, otherwise the deploy is rejected.

### Task 8: documentation and the first release

**Files:** modify `README.md`, `docs/player.md`, `docs/tracker-guide.md`, `web/README.md`, `docs/design-versioning-and-releases.md` (the section 4 row for `symbols.json`: four numeric labels instead of two fields); create `docs/releasing.md`.

- [ ] **Step 1:** `docs/releasing.md`: the branch model, the steps of a release (release branch, raise `RELEASE` in `web/version.js` and the `release_*` constants and comment line in `src/music.asm`, `make player`, run the golden tests, merge into `main`, tag, merge back), the rule for raising `FORMAT` (golden test fails; add migration, new golden set with `node web/model/golden/make.mjs <n>`), and the Pages settings from Task 7.
- [ ] **Step 2:** README: a short "Versions and releases" section linking to it, the changed Pages note (root = latest release, `/dev/` = develop), and the new test lines (`node --test web/version.test.mjs web/model/migrate.test.mjs web/model/golden.test.mjs web/app/handover.test.mjs web/app/releases.test.mjs web/app/upgrade.test.mjs tools/release-tools.test.mjs`). `docs/player.md`: the version constants and what counts as a format change (including that a changed meaning with the same bytes is not caught by the test). `docs/tracker-guide.md`: the dialog and how porting reports losses. `web/README.md`: the new files in the layers and the corrected Pages sentence.
- [ ] **Step 3:** run every `node --test` line of the README; expect PASS. Commit `docs: versions, releases and the porting dialog`.
- [ ] **Step 4: gitflow to `v0.1.0`, all local:** `git switch develop && git merge --no-ff feature/versioning`; `git switch -c release/0.1.0`; check that `RELEASE` and the player constants say `0.1.0` (they already do; the golden test and `check-tag` agree); `git switch main && git merge --no-ff release/0.1.0`; `git tag -a v0.1.0 -m "v0.1.0"`; `git switch develop && git merge --no-ff main`. Plain messages, no attribution.
- [ ] **Step 5: stop.** Report to the maintainer that branches and tag exist locally and that pushing `develop`, `main` and the tag `v0.1.0` (after the settings change from Task 7, step 7) publishes the site. Push only on their word.

---

## Self-review

- **Spec coverage:** two numbers and where they live → tasks 1, 2; format-change detection (golden, migration test, fingerprint, blind spot) → 4 and 8; opening older/newer files, dialog, loss report, handover, autosave, edge cases, format 1 tolerance → 3, 5, 6; gitflow, releases, Pages layout, `releases.json`, tag/number check, GitHub release downloads → 7 and 8; first release `v0.1.0` and the route there → 8; asm import is out of scope (design section 9).
- **Types:** `inspectProject`'s `older` result feeds `describeUpgrade` unchanged (`fromFormat`, `release`, `losses`, `problems`, `project`); `pickRelease`/`loadReleases` share the `{release, format}` shape that `buildReleasesJson` writes.
- **Deviation from the design, on purpose:** `symbols.json` keeps its flat shape (four numeric labels, Task 2) and the design is corrected in Task 8.
