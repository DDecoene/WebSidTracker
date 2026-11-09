# Web tracker architecture, version 1

Status: implemented, see [`web/`](../web/README.md). The text below is the original draft; the section "As built" at the end lists where the code differs from it.
Companion to [the player format and timing model](design-player-format-and-timing.md) and [the concept document](concept-hubbard-inspired-player.md).

## 1. Intent

A tracker that runs in the browser as a static site and plays a song with **the same 6502 player code the game uses**. Every edit is audible at once, without restarting playback. Inserting and deleting notes must be as easy as in the desktop trackers. What you hear in the tracker is what the exported files do in your game.

## 2. Goals, non-goals

Goals
- One player. The tracker runs the real `music.asm` in a small 6502 emulator. There is no second implementation of the player to keep in sync.
- Live editing: any change to a note, a length, an order list or an instrument field is heard immediately, while the song plays.
- Sound close to the real chip: a proven SID emulation, not a rough one.
- Static hosting (for example GitHub Pages): no server.
- Export that matches the player design: `song_<name>.asm`, `instruments.asm`, and a ready-to-run `.prg`.

Non-goals for version 1
- No VIC-II, CIA, screen or full C64 emulation. Only a 6502, 64 KB of RAM and the SID.
- No illegal opcodes: the player uses the documented instruction set.
- No `.sid` export yet (the architecture does not prevent it).
- No multi-user editing, no accounts.
- No own SID emulation: an existing one is reused.

## 3. Parts

```
 editor (grid, order lists, instrument editor)
        |  edits
        v
 song model  --serialise-->  bytes in emulated RAM  <--- the 6502 reads them
        ^                              |
        |  playhead fix-up             v
        +------------------  6502 emulator (runs music.asm)
                                       | SID register writes with cycle stamps
                                       v
                           SID emulation -> samples -> speakers
```

| Part | What it is |
|---|---|
| Song model | the source of truth: events, patterns, order lists, instruments, speed. Plain data, no bytes |
| Serialiser | turns the model into the exact bytes of the player design (header, order lists, pattern table, patterns, instrument tables). The same code produces the export |
| 6502 emulator | our own, small, in JavaScript: documented opcodes, 64 KB RAM array, SID registers mapped at $D400 to $D41C |
| SID emulation | reSIDfp, compiled to WebAssembly (see 7). Reused, not written by us |
| Audio output | an `AudioWorklet` that pulls samples (see 5) |
| Editor | the grid and instrument screens. A view of the model, nothing more |
| Export | the serialiser output as assembler text, plus a `.prg` (see 8) |

## 4. The emulated machine

- 64 KB RAM as a plain byte array. The player code and the tables sit at fixed addresses chosen in the build; the tracker's serialised song and instruments sit at fixed addresses behind them.
- The emulator needs no interrupt hardware. It plays the role of the raster interrupt itself: once per frame it calls `music_play` and runs until the routine returns, counting cycles.
- **PAL timing:** 985,248 cycles per second, 19,656 cycles per frame. That makes 50.125 frames per second (985,248 / 19,656), not exactly 50. The 6502 core counts cycles per instruction exactly as the documented timing says, including page-crossing penalties, because the cycle stamps on the SID writes are what the SID emulation hears.
- Writes to $D400 to $D418 are passed on to the SID emulation with the cycle at which they happened. The rest of the frame is clocked silently to the end of the frame.

## 5. Audio and the thread model

- The emulator and the SID emulation run **inside an `AudioWorklet`**, so audio is never starved by the page.
- One frame of output is about 958 samples at 48 kHz. The worklet produces one frame at a time when its buffer runs low, then hands out samples in its normal 128-sample steps.
- The main thread (editor) sends messages to the worklet: "write these bytes at this address", "start song at this position", "mute voice", "stop". The worklet applies them **between two frames**, so an edit can never be half-applied.
- No `SharedArrayBuffer`: that needs special HTTP headers that static hosts such as GitHub Pages do not offer. Messages are enough because edits are small.

## 6. Live editing

### 6.1 Writing an edit

An edit changes the model. The serialiser re-creates the whole song and instrument data (a few hundred bytes) and the main thread sends it to the worklet, which writes it into RAM between two frames. Because nothing else runs between frames, this is atomic without double buffering.

### 6.2 Instruments

Because instruments are stored as one table per field, an instrument edit changes one byte at a known address. The player reads instrument fields every frame, so pulse sweep, vibrato, arpeggio and drum parameters change the sound of the note that is already playing. Fields that only matter at the start of a note (waveform, ADSR, starting pulse width) apply from the next note.

### 6.3 Inserting and deleting notes: the playhead

Inserting a note makes the byte stream of that pattern longer, so the position each voice has inside it must move along. The tracker keeps, per voice, a map between *events in the model* and *byte offsets in the serialised data*.

When it re-serialises:
1. It reads each voice's current position from the **state block** (see 6.4): which order entry, which byte offset in the pattern, how many ticks are left.
2. It finds which model event that offset belongs to.
3. After serialising it computes the new offset of the same event and writes it back to the state block, still between two frames.
4. If the event was deleted, the voice continues at the next event and starts it at the next tick.

An edit that does not move the playhead's pattern (another pattern, another voice) needs no fix-up.

### 6.4 The state block

The player keeps all per-voice state (order position, pattern position, ticks left, current instrument, current pitch, vibrato, arpeggio and drum counters, pulse width) at **fixed, documented addresses** in one block, in separate arrays per field. The block is part of the player's contract: `music.asm` exports its symbols, and the tracker reads them from there. This is useful for game developers too (for example to see where a voice is).

## 7. SID emulation and build

- **Engine:** reSIDfp, the accurate fork of reSID, compiled to WebAssembly with Emscripten. It is now developed as its own library, `libresidfp`; we build version 1.2.3. Sound is judged in VICE's accurate mode as the reference (see 11).
- Both 6581 and 8580 models are available. The default model is an open choice (see 12).
- **Build step:** only for the WebAssembly module. A script builds it with Emscripten and the result (a `.wasm` file plus a small JavaScript wrapper) is committed, so nobody needs Emscripten to work on the editor or the player. The rest of the web app is plain ES modules with no bundler.
- Settings that reSIDfp keeps globally are set once at start-up, not per instance.
- **Built and measured.** reSIDfp starts threads to compute its filter tables, which a browser page cannot do without `SharedArrayBuffer` (see 5). A small patch makes it run those jobs one after the other; the result is the same. Building needs 32 MB of memory. Creating a chip takes about 0.3 s per model the first time, so the worklet creates both models up front. `web/` has a sound test and a Node test that measures the pitch of a tone; `web/README.md` explains the pieces.

## 8. Export

- `instruments.asm`, `song_<name>.asm`: the serialiser output, written as assembler text with comments, in the layout of the player design.
- `.prg`: a prebuilt player binary plus the serialised bytes placed at the addresses the player expects. The tracker does this with the same code that fills the emulated RAM, so the `.prg` and the live playback are the same bytes.
- `music.asm` itself is shipped as a file the user copies. It does not change per song.

## 9. Licences

- Player, `instruments.asm`, `song_<name>.asm` and the exported `.prg` are MIT.
- The web app is GPL (it contains reSIDfp, which is GPL). The repository gets a licence file per directory (the player part and the web part) and the README says so. The exports contain no GPL code.
- Third-party test material is kept apart from the player and the exports.

## 10. Repository layout (proposal)

| Path | What | Licence |
|---|---|---|
| `src/` | the C64 side: `music.asm`, hardware names, the prebuilt test songs | MIT |
| `web/` | the browser app: model, serialiser, 6502 emulator, worklet, editor | GPL |
| `web/sid/` | the built reSIDfp WebAssembly module and the script that builds it | GPL |
| `docs/` | design documents | MIT |

## 11. Verification

- **The 6502 core** is tested against a public 6502 functional test program, chosen so that its licence is compatible with the web part. The cycle counts are tested against published instruction timings.
- **The serialiser** is tested by round trip: model, bytes, model.
- **Live editing** is tested by editing while a song plays and comparing the SID write list afterwards with a run that started from the finished song at the same position.
- **Sound** is judged by ear in VICE's accurate emulator (x64sc) with the same exported files, and by measurement where measurement can say something (a drum that clicks is judged by listening).

## 12. Open choices (can change while building)

- Editor technology: plain ES modules and the DOM, no framework.
- The default SID model: 6581, because that is what most game music was written on.
- State block layout: one array per field, exact addresses fixed in `music.asm`.
- One song in memory at a time. A game plays songs one by one; the tracker edits one song at a time.
- The AudioWorklet thread model above, instead of running the emulator on the main thread.
- A public 6502 functional test as the first check of the CPU core.

## 13. As built

Parts 1 to 12 describe the plan. The code follows it; these are the differences and the details the draft left open (checked against `web/`):

- **Parts and files.** Song model: `web/model/project.js`. Serialiser (and the reverse parse, and the playhead maps): `web/model/serialise.js`. Exports and project file: `web/model/export.js`. 6502 core: `web/cpu/cpu6502.js`. Engine: `web/engine/engine.js` (no DOM, also used by the tests), `worklet.js` (audio thread), `client.js` (page side). App shell: `web/app/` (store, session, live, panels, files, main). Editors: `web/ui/`. There is no bundler: plain ES modules.
- **Extra layers between the editor and the engine.** `store.js` holds the project, undo and the selection, and every editor change goes through `store.update`. `session.js` creates the engine on the first click or key press and runs play, stop, mute and note audition. `live.js` keeps a mirror of the bytes the engine holds and sends the smallest set of RAM writes plus the playhead fix-up as one `edit` message.
- **SID registers.** The engine passes writes to `$D400` to `$D418` to the SID (25 registers), not up to `$D41C` as 4 says. The cycle stamp is the last cycle of the writing instruction.
- **Frames.** The engine runs one frame at a time: it queues every change (write, start, stop, edit, mute, chip model) and applies the queue at the start of the next frame, as 5 describes. The worklet sends playhead state messages 20 times a second.
- **Edits.** As 6.1: the whole song is re-serialised, but only the changed bytes are written to RAM. The playhead fix-up (6.3) is built as described, using the state block (`st_order_pos`, `st_pat_lo/hi`, `st_pat_pos`, `st_ticks_left`). Instrument edits (6.2) write single bytes in the tables.
- **Memory map in the emulated machine.** The player image from `web/player/player.prg` is loaded as it is: program at `$0801`, player at `$1000`, instrument tables at `$2000` to `$2EFF`, the song at `$3000` (it must end below `$C000`). The draft said "one song in memory at a time"; the tracker also keeps a scratch song at `$C000` for note auditions, so a key press on the piano plays a note without touching the song.
- **The player image is built by `make player`** (`tools/build-player.sh`, ACME) and committed with `symbols.json`, so neither the browser nor Node needs an assembler. This was not in the draft.
- **Export (8).** `instruments.asm`, `song_<name>.asm` and the `.prg` are made by `export.js`. The `.prg` is the player image with the tables and the song patched in at the same addresses; whatever the image had from `$2000` up (the demo song) is removed. The tracker does not ship `music.asm`; the export dialog tells you to copy it from `src/`. A project file (JSON, format `websidtracker-project`, version 1) is saved and opened separately, and autosaved in the browser's local storage.
- **Limits that the tracker's validation does not check but the player has.** At most 255 bytes per pattern and 128 order entries per voice (see `docs/player.md`, section 7). The tracker allows 256 entries per voice and does not measure pattern bytes. The release value is a free 0 to 255 field; the player clamps it to 1 to 32.
- **Editor.** Built as plain DOM, no framework. The mouse only places the cursor; there is no mouse selection and no copy and paste yet. Undo and redo keep 200 steps, edits of the same kind within 1.5 seconds share one step.
- **SID model.** Default 6581, switch to 8580 in the header. The worklet creates both chips at start, so switching does not stall the audio.
- **Licences.** As 9: `web/LICENSE` (GPL version 3 or later) and the root `LICENSE` (MIT). The 6502 test material (Klaus Dormann's functional test, Tom Harte's SingleStepTests) is downloaded by `web/cpu/fetch-tests.sh` into `web/cpu/.cache`, which is not committed, and checked by checksum.
- **Publishing.** `.github/workflows/pages.yml` publishes `web/` on GitHub Pages without a build step.
- **Verification (11).** The CPU core is tested against both public suites. The serialiser round trip (model, bytes, model) is in `web/model/test.mjs`. Live editing is tested in `web/app/live.test.mjs` and `session.test.mjs` and the engine in `web/engine/test.mjs`. The sound of the player was checked in VICE (x64sc) as described in `docs/player.md`, section 9.
- **Not built:** NTSC, filter, sound effects, `.sid` export, mouse selection and copy and paste.
