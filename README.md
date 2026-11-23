# WebSidTracker

Sweeping pulses, late vibrato, drums on the bass: now with a tracker. WebSidTracker brings the per-frame tricks Rob Hubbard made famous on the C64 (pulses that sweep, vibrato that comes in late, chords from one voice, drums that share the bass channel) to a tracker in your browser, with a small clean-room player you can drop into your own Commodore 64 game. Not affiliated with Rob Hubbard; none of his code or music is used.

> **Status: working, not finished (alpha, release 0.2.5).** The C64 player is built and measured, the browser tracker runs it live: a 6502 core, reSIDfp as WebAssembly, the song model with export, the pattern and order editor and the instrument editor all exist. Try it at <https://ddecoene.github.io/WebSidTracker/>. What is still open is listed in the [roadmap](#roadmap). How to use the tracker: [docs/tracker-guide.md](docs/tracker-guide.md).

## How it started

WebSidTracker began as a side quest of [raster-rumble](https://github.com/DDecoene/raster-rumble), a small C64 game. Its sound was basic: three effects written by hand (a blip, a ting, an explosion) and a simple tune, and it dragged the whole game down. Looking for how the classic games did it led to Rob Hubbard's players, and to two problems. His code is not ours to copy, and there was no tracker for it: you could not *see* the music while you wrote it, the way you can in a mod tracker. So this project builds both from scratch: an original player that drops into a game, and a tracker in the browser that runs it.

raster-rumble was the first user. Since its release 0.0.5 all of its sound comes from this player, and its tune and effects are a WebSidTracker project ([`music/raster-rumble.json`](https://github.com/DDecoene/raster-rumble/blob/main/music/raster-rumble.json)) that you can open in the tracker. Nothing in the tracker or the player is specific to that game.

## Why

The sound of the classic C64 game composers does not come from fancy notes. It comes from playing the SID chip **every frame**: the pulse width sweeps while a note sounds, vibrato starts late like a hand on a string, one voice arpeggiates a chord, a drum is a puff of noise followed by a falling tone. All of it is driven by tiny pattern data that costs a few hundred bytes for a whole song.

Hubbard himself never had a tracker: he typed his music as numbers into his assembly source, and his player was never a tool anyone else could use. The good desktop trackers came later (GoatTracker, SID-Wizard, SID Factory II); they show you the notes, but the per-frame sound you build yourself. What was missing is a tracker built around exactly those tricks, that lives in the browser, and comes with a small player you fully understand and can read in an afternoon. That is this project.

The full story (what made that approach special, what such a player contains, what we do differently) is in **[docs/concept-hubbard-inspired-player.md](docs/concept-hubbard-inspired-player.md)**. Read that first.

## The plan

1. **A player in 6502 assembly**, original work, about 2 KB: three voices, patterns and an order list per voice, instruments as parameter records, per-frame effects (pulse sweep, vibrato, arpeggio, pitch slide, drums), and sound effects that borrow a voice and give it back. Built, see [docs/player.md](docs/player.md).
2. **A tracker in the browser**: a grid with three voice columns, an instrument editor, and live playback where every edit is heard at once. The tracker runs the real 6502 player in its own small emulator and sends the SID writes to a SID emulation that sounds like the real chip (reSIDfp, compiled to WebAssembly). Built.
3. **Export**: assembler source for song, instruments and sound effects (drop it next to the player in your game), a ready-to-run `.prg`, and a `.sid` file for SID players. Built.

## Rules of this project

- **Clean-room.** No code, data, labels or byte formats of any existing player or tracker are used, and no disassembly of someone else's work is kept here, not even as a reference.
- Not compatible with any existing player's data format on purpose. Same *feel*, our own structure.
- Examples and test songs are our own music.

## What is in this repository

| Path | What |
|---|---|
| `docs/concept-hubbard-inspired-player.md` | the concept: the approach, the player's ingredients, the tracker, distribution |
| `docs/design-player-format-and-timing.md` | the player design: song and instrument data, ticks and frames, clean note starts (with an "As built" section) |
| `docs/design-web-tracker-architecture.md` | the browser tracker design: own 6502 emulator, reSIDfp, live editing, export (with an "As built" section) |
| `docs/player.md` | how to call the player, memory map, state block, exact behaviour, limits, measurements |
| `docs/design-sound-effects.md`, `docs/plan-sound-effects.md` | the design of the sound effects and the pitch slide, and the plan it was built from (with an "As built" section) |
| `docs/tracker-guide.md` | user guide of the tracker: concepts, keys, instrument fields, export, sound effects |
| `src/music.asm` | the player (MIT) |
| `src/instruments.asm`, `src/sfx.asm`, `src/song_demo.asm` | the default instrument set, three example sound effects and a demo song |
| `src/runner.asm`, `src/main.asm` | a complete program: BASIC line, raster interrupt, player, instruments, effects (keys 1 to 9), song (this is the image the tracker exports) |
| `src/hardware.asm` | names for the VIC-II, SID and CIA registers, no code |
| `web/` | the browser app (GPL), see [web/README.md](web/README.md) |
| `web/cpu/` | the 6502 core and its tests |
| `web/sid/` | reSIDfp build script, C wrapper, loader and a Node test |
| `web/engine/` | the audio engine: 6502 + SID, the AudioWorklet and its client |
| `web/model/` | song model, serialiser, exports, the demos |
| `web/app/` | the app shell: store, undo, live editing glue, files, panels |
| `web/ui/` | the pattern and order editor, the Effects view and the instrument editor |
| `web/player/` | the built player image (`player.prg`, `symbols.json`) and its tests |
| `tools/` | the player build script, a label converter, a small server for the browser C64 emulator |
| `Makefile`, `project-config.json`, `.vscode/` | build and run |
| `.github/workflows/pages.yml` | runs the tests and publishes the site on GitHub Pages |
| `.github/workflows/release.yml` | makes the GitHub release for a tag |
| `docs/releasing.md` | versions, branches and how to make a release |

## Versions and releases

Every file and part carries a format version (one number for the project json, the song and instrument asm files and the player) and a release version. A tracker that meets an older project file says what porting would lose and lets you choose between porting and the old tracker. The published site shows the newest release, every release stays under its own address, and the `develop` branch is previewed under `/dev/`. The branches and the steps of a release are in [docs/releasing.md](docs/releasing.md); the reasons in [the design](docs/design-versioning-and-releases.md).

## Running the tracker

Online: <https://ddecoene.github.io/WebSidTracker/> (the landing page, with a link to the tracker itself at `/tracker.html`).

Locally, from a folder with a web server (an AudioWorklet does not load from `file://`):

```
cd web
python3 -m http.server 8010
```

Then open <http://127.0.0.1:8010/>. Audio starts at your first click or key press.

The **Demos** menu in the header loads one of six songs (Ode to Joy, what a first visit starts with, Für Elise, Rondo alla Turca, Toccata in D minor, In the Hall of the Mountain King, and an original demo tune) or a set of sound effects over the original tune (open the Effects tab). Open one, press Play and change things while it plays. There is no build step for the web app; `web/sid/sid.wasm` and `web/player/player.prg` are committed. The older sound test page is at `/sound-test.html`.

## Building the C64 side

You need [ACME](https://sourceforge.net/projects/acme-crossass/) and, to run it, [VICE](https://vice-emu.sourceforge.io/).

```
make          # builds build/websidtracker.prg
make vice     # builds and runs in VICE (x64sc, the accurate emulator: use it to judge sound)
make test     # builds and runs in the vc64web browser emulator (fetched on first use)
make player   # rebuilds web/player/player.prg and symbols.json (needs ACME and python3)
```

Run `make player` after every change in `src/`, and commit the two files it writes.

## Running the tests

Node.js 22 or later; no packages to install. From the repository root:

```
node --test web/player/test.mjs
node --test web/model/test.mjs web/model/player.test.mjs
node --test web/model/demos/*.test.mjs
node --test web/engine/test.mjs
node --test web/app/files.test.mjs web/app/live.test.mjs web/app/session.test.mjs web/app/store.test.mjs
node --test web/app/integration.test.mjs web/app/manual.test.mjs
node --test web/ui/editor-logic.test.mjs web/ui/instruments-logic.test.mjs
node --test web/cpu/test.mjs
node --test web/version.test.mjs web/model/migrate.test.mjs web/model/golden.test.mjs
node --test web/app/handover.test.mjs web/app/releases.test.mjs web/app/upgrade.test.mjs web/app/autosave-lock.test.mjs web/app/autosave.test.mjs
node --test tools/release-tools.test.mjs
node web/sid/test.mjs

web/cpu/fetch-tests.sh              # once: downloads the public 6502 test material into web/cpu/.cache
node web/cpu/klaus.mjs              # Klaus Dormann's functional test
node web/cpu/singlestep.mjs         # Tom Harte's SingleStepTests, instruction results and cycle counts
```

The player tests need `web/player/player.prg` (committed). Rebuilding `sid.wasm` needs [Emscripten](https://emscripten.org/) (`sh web/sid/build.sh`); you do not need it otherwise.

## Roadmap

Done:

- [x] Choose the data format and the tick/timing model ([design](docs/design-player-format-and-timing.md))
- [x] Choose the architecture of the web tracker ([design](docs/design-web-tracker-architecture.md))
- [x] Choose the licences (MIT for the player and exports, GPL for the web app)
- [x] The player in assembly: patterns, order lists, instruments, pulse sweep, vibrato, arpeggio, drums, legato, clean note start and end, state block at fixed addresses ([docs/player.md](docs/player.md))
- [x] Browser: a 6502 core in JavaScript, tested against public 6502 tests ([web/cpu](web/cpu/cpu6502.js))
- [x] Browser: reSIDfp as WebAssembly, the audio engine and the AudioWorklet
- [x] Browser: song model, serialiser, live editing with playhead fix-up, undo, autosave, project files
- [x] Browser: the pattern and order editor and the instrument editor
- [x] Export to assembler source and `.prg`
- [x] Export to a `.sid` file (PSID version 2)
- [x] Block selection with the keyboard and the mouse, copy, cut and paste in the pattern editor
- [x] A three-note arpeggio: a second offset per instrument, so one voice can play a full triad (format 2; format 1 files are ported without loss)
- [x] Sound effects that borrow a voice (made in the Effects tab, started by the game with `sfx_play`), and a pitch slide per instrument (format 2) ([design](docs/design-sound-effects.md))
- [x] Versions and releases: a format version in every file, porting of older project files, releases published on Pages ([design](docs/design-versioning-and-releases.md), [how to release](docs/releasing.md))

Open:

- [ ] Fine-tuning the sound by ear (instrument defaults, the demo song)
- [ ] NTSC (frequency table and 60 Hz timing)
- [ ] Priorities between sound effects, and effects that drive two voices by themselves
- [ ] Filter (and other later features: portamento, volume per voice)
- [ ] Open `song_<name>.asm` and `instruments.asm` in the tracker (only the project file can be opened now)

## Licence

This project has two licences, split by what you use in your game.

**The player and everything the tracker exports: [MIT](LICENSE).** That is `src/` (the player and its tables), `docs/`, and the files you take from the tracker: `music.asm`, `instruments.asm`, `sfx.asm`, `song_<name>.asm`, the `.prg` and the `.sid`. Use it for anything, in free or commercial games and demos, as long as the copyright notice and the licence text stay with the parts of this project you use.

- Your game or demo is your own work and can have any licence you like. Only the WebSidTracker parts you include (the player) keep the MIT terms.
- In practice that means a line in your credits or readme, for example: *Music player by Dennis Decoene (WebSidTracker, MIT licence)*.
- The songs and instruments you make with the tracker are yours. The exported files contain the player, so the line above applies to that part.
- The exported files contain no GPL code.

**The web app (the tracker in the browser): GPL.** It lives in `web/` and carries its own licence file there (`web/LICENSE`, GPL version 3 or later). It contains a SID emulation (reSIDfp) that is GPL, so the web app as a whole is GPL. This only concerns the tracker itself. It does not affect your game or the files you export from it.

Everything outside `web/` is MIT.
