# WebSidTracker

A SID music tracker for the browser, built clean-room, with a small player you can drop into your own C64 game.

**Status: concept.** Nothing is built yet. Start with [the concept document](docs/concept-hubbard-inspired-player.md).

The idea: the sound of the classic C64 game composers comes from playing the SID chip *every frame* (pulse-width sweeps, vibrato, arpeggios, drums on a melodic voice), driven by compact pattern data. WebSidTracker wants to make that approach available as:

- a tracker in the browser with live playback,
- a small, original player in 6502 assembly,
- export of song and instrument data (assembler source and a ready-to-run `.prg`).

It is not affiliated with, and contains no code from, any existing player or tracker.
