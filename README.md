# WebSidTracker

A SID music tracker for the browser, built clean-room, with a small player you can drop into your own Commodore 64 game.

> **Status: concept.** The web app and the player do not exist yet. What is here is the plan ([concept document](docs/concept-hubbard-inspired-player.md)) and an empty C64 project to build the player in.

## Why

The sound of the classic C64 game composers does not come from fancy notes. It comes from playing the SID chip **every frame**: the pulse width sweeps while a note sounds, vibrato starts late like a hand on a string, one voice arpeggiates a chord, a drum is a puff of noise followed by a falling tone. All of it is driven by tiny pattern data that costs a few hundred bytes for a whole song.

The good desktop trackers exist (GoatTracker, SID-Wizard, SID Factory II). What is missing is a tracker that lives in the browser, shares with a link, and comes with a small player you fully understand and can read in an afternoon. That is this project.

The full story (what made that approach special, what such a player contains, what we do differently) is in **[docs/concept-hubbard-inspired-player.md](docs/concept-hubbard-inspired-player.md)**. Read that first.

## The plan

1. **A player in 6502 assembly**, original work, about 1 to 2 KB: three voices, patterns and a pattern list per voice, instruments as parameter records, per-frame effects (pulse sweep, vibrato, arpeggio, drums).
2. **A tracker in the browser**: a grid with three voice columns, an instrument editor, live playback through a SID emulation that sounds like the real chip.
3. **Export**: assembler source for song and instruments (drop it next to the player in your game), and a ready-to-run `.prg`. Maybe a `.sid` file later.

## Rules of this project

- **Clean-room.** No code, data, labels or byte formats of any existing player or tracker are used, and no disassembly of someone else's work is kept here, not even as a reference.
- Not compatible with any existing player's data format on purpose. Same *feel*, our own structure.
- Examples and test songs are our own music.

## What is in this repository

| Path | What |
|---|---|
| `docs/concept-hubbard-inspired-player.md` | the concept: the approach, the player's ingredients, the tracker, distribution |
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

- [ ] Choose the data format and the tick/timing model (see the open questions in the concept document)
- [ ] First player: one voice, patterns, instruments, in assembly
- [ ] Add per-frame effects one by one, checked by ear and by spectrum analysis
- [ ] Browser: the player logic and a SID emulation
- [ ] Browser: the tracker grid and the instrument editor
- [ ] Export to assembler source and `.prg`
- [ ] Choose a licence

## Licence

Not chosen yet. Until one is added, all rights are reserved.
