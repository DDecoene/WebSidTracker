# Sound effects and pitch slides: implementation plan

**Goal:** effects that a game starts with one call, made and heard in the tracker, plus a pitch slide per instrument.

**Architecture:** the player's per-voice state grows from 3 to 6 lanes (3 music, 3 effects, one per SID voice), all played by the same `play_voice`. The tracker keeps effects in the project, serialises them to a fixed area of its image, and edits them with the pattern editor in a one-voice mode.

**Tech stack:** 6502 assembly (ACME), plain ES modules, Node's test runner, the project's own 6502 core and reSIDfp.

**Spec:** [design-sound-effects.md](design-sound-effects.md)

## Global constraints

- With `inst_slide` 0 and no effect playing, the SID writes of every demo song are identical to the player before this work (frame, register, value), 3000 frames each.
- FORMAT stays 2. A format 2 file without `effects` or `slide` still opens.
- Player code inside 2 KB; zero page stays 14 bytes.
- Tracker image: instruments `$2000-$30FF` (17 tables), effects `$3100-$37FF`, song `$3800`.
- Clean-room: nothing from other players. Code, comments and docs in English. Small commits, no push.

## Review focus

1. An effect requested before any `music_init` (title screen): the zero state in the file must play it.
2. The music lane of a voice must not come back in the middle of a note after an effect.
3. Editing an effect while it plays must not leave a lane reading moved bytes (the tracker sends a stop).
4. A sliding note with vibrato, and the clamping at 0 and `$FFFF`.
5. Opening a format 2 file written before this work (no `effects`, no `slide`).

---

### Task 1: the player

**Files:** `src/music.asm`, `src/instruments.asm`, new `src/sfx.asm`, `src/runner.asm`, `web/player/*` (built), `web/player/test.mjs`.

- State arrays `!fill 6`; `sid_offset` has 6 entries; new 3-byte arrays `st_sfx_req` (0 none, n+1 play n, `$FF` stop), `st_sfx_fit`, `st_sfx_speed`, `st_wait`; new bytes `lane_fit`, `lane_speed` used by `check_release` instead of `st_frame_in_tick` and `st_speed`.
- `sfx_play` (A = effect, X = voice), `sfx_stop` (X = voice). `music_play`: counters, requests, music lanes (only when `st_running`), effect lanes.
- Music lane: while its effect lane is active it sets `st_wait` and skips `write_voice`; with `st_wait` set it writes again only on a new note (`zp_start`) or when its gate is closed.
- Effect lane at `$FF`: `stop_voice`, the rest of the frame writes the gate-off.
- `inst_slide` (table 17): `advance_voice` adds `slide * 8` to `st_freq` with clamping; `calc_frequency` uses `st_freq` plus vibrato for a sliding non-drum note.
- Runner: song at `$3800`, `sfx.asm` at `$3100`, keys 1-9 play effects 0-8 on the voice in `sfx_voice` (KERNAL `SCNKEY`/`GETIN` in the main loop).
- Tests: effect starts on the next frame on its voice; music lane silent during it and back at its next note; two effects at once; replace; `sfx_stop`; effect without a song; slide up, down, clamped, with vibrato, on a drum. One-off check against the saved reference player for all demos.

### Task 2: the model, export and format

**Files:** `web/model/project.js`, `serialise.js`, `export.js`, `migrate.js`, `fingerprint.js` (if it lists tables), golden set and tests, `web/model/demos/*`.

- `project.effects = [{ name, speed, voice, events }]`, instrument field `slide` (-128..127).
- `serialiseEffects(effects, base)`: `sfx_lo`, `sfx_hi`, `sfx_voice` (64 bytes each), a shared stub (speed 1, `$FF`) for unused slots, then each effect: speed, events, `$FF`.
- `validate`: at most 64 effects, at most 255 bytes per effect incl. `$FF`, at least one note or rest, instruments exist, fits `$3100-$37FF`. `lint`: arpeggio is ignored on a sliding note.
- `projectFromData` fills a missing `effects` with `[]` and a missing `slide` with 0; migration 1 to 2 adds both.
- `exportSfxAsm(effects)`; `exportInstrumentsAsm` gets `inst_slide`; `exportPrg` writes effects at `$3100` and the song at `$3800`; `.sid` follows.
- Golden format-2 set made again with an effect and a sliding instrument.
- A demo "Sound effects": a short loop and the three raster-rumble moments as fat effects.

### Task 3: engine, live editing, session

**Files:** `web/engine/engine.js`, `worklet.js`, `client.js`, `web/app/live.js`, `session.js`, tests.

- Engine: `playEffect(voice, n)` writes `st_sfx_req`; it calls `music_play` every frame while the song runs or an effect lane is active or requested.
- Live: the effects area is part of the mirror (snapshot and diff); a changed effects area also writes `$FF` to the three requests (stop).
- Session: `store.playEffect(index)`, plays on the effect's audition voice, over the song when it plays.

### Task 4: the tracker UI

**Files:** `web/tracker.html`, `web/ui/editor.js` (option `single`), new `web/ui/effects.js`, `web/ui/instruments.js`, `instruments-logic.js`, CSS, `web/app/main.js`, `web/app/manual.js`.

- A "Song / Effects" switch above the editor. Effects view: the list (add, duplicate, delete, rename, move, speed, voice, Play) and the pattern editor in one-voice mode on an adapter store that maps the effect to a one-pattern song.
- Ctrl/Cmd+Enter plays the selected effect. Instrument editor gets "Slide".
- Export dialog lists `sfx.asm`.

### Task 5: docs and the local test

- `docs/player.md`, `docs/tracker-guide.md`, the manual, the README roadmap, the design document's status, the format notes in the design for format and timing.
- Full README test list; listen in VICE to the exported `.prg` of the effects demo (keys 1-3).
