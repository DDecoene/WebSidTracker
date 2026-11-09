# WebSidTracker

A SID music tracker for the browser, built clean-room, with a small player you can drop into your own Commodore 64 game.

> **Status: working, not finished.** The C64 player is built and measured, the browser tracker runs it live: a 6502 core, reSIDfp as WebAssembly, the song model with export, the pattern and order editor and the instrument editor all exist. Try it at <https://ddecoene.github.io/WebSidTracker/>. What is still open is listed in the [roadmap](#roadmap). How to use the tracker: [docs/tracker-guide.md](docs/tracker-guide.md).

## Why

The sound of the classic C64 game composers does not come from fancy notes. It comes from playing the SID chip **every frame**: the pulse width sweeps while a note sounds, vibrato starts late like a hand on a string, one voice arpeggiates a chord, a drum is a puff of noise followed by a falling tone. All of it is driven by tiny pattern data that costs a few hundred bytes for a whole song.

The good desktop trackers exist (GoatTracker, SID-Wizard, SID Factory II). What is missing is a tracker that lives in the browser, shares with a link, and comes with a small player you fully understand and can read in an afternoon. That is this project.

The full story (what made that approach special, what such a player contains, what we do differently) is in **[docs/concept-hubbard-inspired-player.md](docs/concept-hubbard-inspired-player.md)**. Read that first.

## The plan

1. **A player in 6502 assembly**, original work, about 1.5 KB: three voices, patterns and an order list per voice, instruments as parameter records, per-frame effects (pulse sweep, vibrato, arpeggio, drums). Built, see [docs/player.md](docs/player.md).
2. **A tracker in the browser**: a grid with three voice columns, an instrument editor, and live playback where every edit is heard at once. The tracker runs the real 6502 player in its own small emulator and sends the SID writes to a SID emulation that sounds like the real chip (reSIDfp, compiled to WebAssembly). Built.
3. **Export**: assembler source for song and instruments (drop it next to the player in your game), and a ready-to-run `.prg`. Built. Maybe a `.sid` file later.

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
| `docs/tracker-guide.md` | user guide of the tracker: concepts, keys, instrument fields, export |
| `src/music.asm` | the player (MIT) |
| `src/instruments.asm`, `src/song_demo.asm` | the default instrument set and a demo song |
| `src/runner.asm`, `src/main.asm` | a complete program: BASIC line, raster interrupt, player, instruments, song (this is the image the tracker exports) |
| `src/hardware.asm` | names for the VIC-II, SID and CIA registers, no code |
| `web/` | the browser app (GPL), see [web/README.md](web/README.md) |
| `web/cpu/` | the 6502 core and its tests |
| `web/sid/` | reSIDfp build script, C wrapper, loader and a Node test |
| `web/engine/` | the audio engine: 6502 + SID, the AudioWorklet and its client |
| `web/model/` | song model, serialiser, exports |
| `web/app/` | the app shell: store, undo, live editing glue, files, panels |
| `web/ui/` | the pattern and order editor and the instrument editor |
| `web/player/` | the built player image (`player.prg`, `symbols.json`) and its tests |
| `tools/` | the player build script, a label converter, a small server for the browser C64 emulator |
| `Makefile`, `project-config.json`, `.vscode/` | build and run |
| `.github/workflows/pages.yml` | publishes `web/` on GitHub Pages |

## Running the tracker

Online: <https://ddecoene.github.io/WebSidTracker/> (the landing page, with a link to the tracker itself at `/tracker.html`).

Locally, from a folder with a web server (an AudioWorklet does not load from `file://`):

```
cd web
python3 -m http.server 8010
```

Then open <http://127.0.0.1:8010/>. Audio starts at your first click or key press.

The **Demos** menu in the header loads one of six songs: Ode to Joy (what a first visit starts with), Für Elise, Rondo alla Turca, Toccata in D minor, In the Hall of the Mountain King, and an original demo tune. Open one, press Play and change things while it plays. There is no build step for the web app; `web/sid/sid.wasm` and `web/player/player.prg` are committed. The older sound test page is at `/sound-test.html`.

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
node --test web/model/test.mjs
node --test web/engine/test.mjs
node --test web/app/files.test.mjs web/app/live.test.mjs web/app/session.test.mjs web/app/store.test.mjs
node --test web/ui/editor-logic.test.mjs web/ui/instruments-logic.test.mjs
node --test web/cpu/test.mjs
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

Open:

- [ ] Fine-tuning the sound by ear (instrument defaults, the demo song)
- [ ] NTSC (frequency table and 60 Hz timing)
- [ ] Sound effects that borrow a voice
- [ ] Filter (and other later features: portamento, volume per voice)
- [ ] Mouse selection and copy/paste in the pattern editor (the mouse only places the cursor now)
- [ ] `.sid` export

## Licence

This project has two licences, split by what you use in your game.

**The player and everything the tracker exports: [MIT](LICENSE).** That is `src/` (the player and its tables), `docs/`, and the files you take from the tracker: `music.asm`, `instruments.asm`, `song_<name>.asm` and the `.prg`. Use it for anything, in free or commercial games and demos, as long as the copyright notice and the licence text stay with the parts of this project you use.

- Your game or demo is your own work and can have any licence you like. Only the WebSidTracker parts you include (the player) keep the MIT terms.
- In practice that means a line in your credits or readme, for example: *Music player by Dennis Decoene (WebSidTracker, MIT licence)*.
- The songs and instruments you make with the tracker are yours. The exported files contain the player, so the line above applies to that part.
- The exported files contain no GPL code.

**The web app (the tracker in the browser): GPL.** It lives in `web/` and carries its own licence file there (`web/LICENSE`, GPL version 3 or later). It contains a SID emulation (reSIDfp) that is GPL, so the web app as a whole is GPL. This only concerns the tracker itself. It does not affect your game or the files you export from it.

Everything outside `web/` is MIT.
