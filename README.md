# WebSidTracker

A SID music tracker for the browser, built clean-room, with a small player you can drop into your own Commodore 64 game.

> **Status: design.** The web app and the player do not exist yet. What is here is the plan: the [concept](docs/concept-hubbard-inspired-player.md), the [player data format and timing](docs/design-player-format-and-timing.md), the [web tracker architecture](docs/design-web-tracker-architecture.md), and an empty C64 project to build the player in.

## Why

The sound of the classic C64 game composers does not come from fancy notes. It comes from playing the SID chip **every frame**: the pulse width sweeps while a note sounds, vibrato starts late like a hand on a string, one voice arpeggiates a chord, a drum is a puff of noise followed by a falling tone. All of it is driven by tiny pattern data that costs a few hundred bytes for a whole song.

The good desktop trackers exist (GoatTracker, SID-Wizard, SID Factory II). What is missing is a tracker that lives in the browser, shares with a link, and comes with a small player you fully understand and can read in an afternoon. That is this project.

The full story (what made that approach special, what such a player contains, what we do differently) is in **[docs/concept-hubbard-inspired-player.md](docs/concept-hubbard-inspired-player.md)**. Read that first.

## The plan

1. **A player in 6502 assembly**, original work, about 1 to 2 KB: three voices, patterns and a pattern list per voice, instruments as parameter records, per-frame effects (pulse sweep, vibrato, arpeggio, drums).
2. **A tracker in the browser**: a grid with three voice columns, an instrument editor, and live playback where every edit is heard at once. The tracker runs the real 6502 player in its own small emulator and sends the SID writes to a SID emulation that sounds like the real chip (reSIDfp, compiled to WebAssembly).
3. **Export**: assembler source for song and instruments (drop it next to the player in your game), and a ready-to-run `.prg`. Maybe a `.sid` file later.

## Rules of this project

- **Clean-room.** No code, data, labels or byte formats of any existing player or tracker are used, and no disassembly of someone else's work is kept here, not even as a reference.
- Not compatible with any existing player's data format on purpose. Same *feel*, our own structure.
- Examples and test songs are our own music.

## What is in this repository

| Path | What |
|---|---|
| `docs/concept-hubbard-inspired-player.md` | the concept: the approach, the player's ingredients, the tracker, distribution |
| `docs/design-player-format-and-timing.md` | the player: song and instrument data, ticks and frames, clean note starts |
| `docs/design-web-tracker-architecture.md` | the browser tracker: own 6502 emulator, reSIDfp, live editing, export |
| `src/main.asm` | the C64 project: an empty program (a BASIC stub that jumps to `start`) |
| `src/hardware.asm` | names for the VIC-II, SID and CIA registers, no code |
| `Makefile`, `project-config.json`, `.vscode/` | build and run |

## Building the C64 side

You need [ACME](https://sourceforge.net/projects/acme-crossass/) and, to run it, [VICE](https://vice-emu.sourceforge.io/).

```
make          # builds build/websidtracker.prg
make vice     # builds and runs in VICE (x64sc, the accurate emulator: use it to judge sound)
make test     # builds and runs in the vc64web browser emulator (fetched on first use)
```

## Roadmap

- [x] Choose the data format and the tick/timing model ([design](docs/design-player-format-and-timing.md))
- [x] Choose the architecture of the web tracker ([design](docs/design-web-tracker-architecture.md))
- [x] Choose the licences (MIT for the player and exports, GPL for the web app)
- [ ] First player: one voice, patterns, instruments, in assembly
- [ ] Add per-frame effects one by one: pulse sweep, vibrato, arpeggio, drum, checked by ear in VICE
- [ ] Voice state block at fixed addresses, so a tracker can follow the playhead
- [ ] Browser: a small 6502 emulator in JavaScript, tested against a public 6502 test
- [ ] Browser: reSIDfp as WebAssembly, played through an AudioWorklet
- [ ] Browser: song model, serialiser and live editing
- [ ] Browser: the tracker grid and the instrument editor
- [ ] Export to assembler source and `.prg`

## Licence

This project has two licences, split by what you use in your game.

**The player and everything the tracker exports: [MIT](LICENSE).** That is `src/` (the player and its tables), `docs/`, and the files you take from the tracker: `music.asm`, `instruments.asm`, `song_<name>.asm` and the `.prg`. Use it for anything, in free or commercial games and demos, as long as the copyright notice and the licence text stay with the parts of this project you use.

- Your game or demo is your own work and can have any licence you like. Only the WebSidTracker parts you include (the player) keep the MIT terms.
- In practice that means a line in your credits or readme, for example: *Music player by Dennis Decoene (WebSidTracker, MIT licence)*.
- The songs and instruments you make with the tracker are yours. The exported files contain the player, so the line above applies to that part.
- The exported files contain no GPL code.

**The web app (the tracker in the browser): GPL.** It will live in `web/` and carries its own licence file there. It contains a SID emulation (reSIDfp) that is GPL, so the web app as a whole is GPL. This only concerns the tracker itself. It does not affect your game or the files you export from it.

Until `web/` exists, everything in this repository is MIT.
