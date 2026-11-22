# Design: sound effects and pitch slides

Status: built (see section 10 for what the code settled). Part of format 2 (not released yet), see section 7.

## 1. Why

WebSidTracker exists because the sound of a game makes or breaks it. Its first user is the game raster-rumble, whose three sound effects (a blip when you dodge, a two-note "ting" on the chapter screen, a noise rumble when you are hit) were written by hand in the game and sound basic. The aim is that a game's effects sound as rich as its music, and that they are made the same way: seen and heard in the tracker, exported, tested in the game, edited again.

So effects become part of the tracker and the player, in the spirit of the classic players: **one machine plays both music and effects**, an effect borrows a voice from the music for a moment and gives it back, and the music stays in time while it is away.

Pitch slides come with it, because the classic game sounds (a laser, a power-up, a falling bomb, a siren) are slides, and the player cannot make an upward slide today.

## 2. Goals, non-goals, anti-goals

Goals:
- An effect is made in the tracker with the same instruments and the same note editing as music, and auditioned there, with or without the song playing.
- The game starts an effect with one call, on a voice it picks. Effects may play on two or three voices at once (a "fat" effect is two effects started together).
- A new instrument feature, the pitch slide, usable in music and effects.
- Effects travel through the existing round trip: project file, export, game.
- Generic: nothing in the design is specific to raster-rumble.

Non-goals (this round):
- Priorities between effects (a new effect on a voice simply replaces the one playing there).
- One effect definition that drives two voices by itself.
- Filter, NTSC, portamento between notes.
- Changing raster-rumble itself (that is the next piece of work) and composing its soundtrack and effects (the user does that by ear).

Anti-goals (a failure even if it works):
- Music without effects and without slides sounds different. With `inst_slide` 0 everywhere and no effect playing, the player's SID writes must be identical to the current format 2 player, frame for frame, for all demo songs.
- An effect that leaves the music out of time, or that makes the music come back in the middle of a note with a click.
- Any code, layout or byte format taken from another player (the project is clean-room).

## 3. Approaches

Considered:
- **A. Effect lanes next to the music lanes (chosen by the user).** The per-voice state arrays grow from 3 to 6 entries: lanes 0 to 2 are the music, lanes 3 to 5 are effects, one per SID voice. An effect lane is played by the same routine as a music lane, so an effect can use every instrument feature. Costs: about 75 bytes more state, and a playing effect costs about as much time per frame as a music voice.
- B. A separate small effect routine with a fixed record per effect (waveform, envelope, start and end note, slide speed, a second voice at an interval). Cheaper per frame, but it needs its own form editor, shares nothing with the instruments, and cannot express a two-note effect or noise followed by a falling tone.
- C. An effect as a separate song. Rejected: the player plays one song at a time, so the music would stop.

## 4. The player

### 4.1 Interface for the game

- `sfx_play`: A = effect number, X = SID voice (0, 1 or 2). It only records the request; the effect starts at the next `music_play`. This makes it safe to call from the main loop while `music_play` runs in an interrupt. A request for a voice that already plays an effect replaces it. Clobbers A, X, Y at most.
- `sfx_stop`: X = SID voice. Stops the effect on that voice at the next `music_play`.
- `music_play` must be called every frame, also when no song plays: effects run without a song (title screens). Before the first `music_init`, `music_play` plays only effects; the state block starts as zeros in the file, which must be a valid "nothing plays" state.
- `music_init` and `music_stop` also end all effects (they clear the SID).
- Volume: the player does not set the volume for effects. `music_init` sets it as before; a game that plays effects without ever starting a song sets `$D418` itself. This is documented.
- The game provides the labels `sfx_lo` and `sfx_hi` (from the exported `sfx.asm`, see 6.3), next to the `inst_*` labels. A game without effects uses an exported `sfx.asm` with zero effects.

### 4.2 What an effect is in bytes

- Two tables, `sfx_lo` and `sfx_hi`: the address of effect n.
- At that address: one byte speed (frames per tick, 0 treated as 1), then events in exactly the pattern event format (note with length, rest, instrument, legato), ended by `$FF`.
- No order list and no transpose. At `$FF` the effect is over.
- The lane starts with instrument 0 unless the effect sets one first. (The tracker always writes an instrument event first, see 6.)

### 4.3 How lanes behave

- Music lanes keep the shared tick clock. Each effect lane has its own frame-in-tick counter, driven by its effect's speed; its first tick is the frame it starts.
- While effect lane 3+v plays, music lane v is computed as usual (positions, ticks, envelopes, vibrato and so on all advance) but it does not write to the SID.
- When the effect ends (its `$FF`, `sfx_stop`, or a replacement), the effect's voice is silenced the same way a rest silences a voice. Music lane v then stays silent until it starts its next note or reads its next rest (a legato note does not count as a new note), so the music never resumes in the middle of a note. This is the classic behaviour and avoids a click.
- An effect note ends cleanly with the same release rule as music. The arpeggio counters are shared by all lanes, as now.
- `st_active` for an effect lane is 1 while it plays. The "song over" test (all voices stopped) looks only at the music lanes.

### 4.4 The pitch slide

- New instrument table `inst_slide`, a signed byte. 0 = no slide (no change in behaviour).
- From the second frame of a note, the frequency moves by `inst_slide x 8` frequency register units per frame (up for positive values). Range: about 1000 units per frame up or down, so a laser can sweep two octaves in well under half a second, and small values give slow sirens and bends. The factor 8 is a proposal (section 9).
- The running frequency is kept in `st_freq_lo/hi` (already used by the drum). It starts at the note's frequency. It stops at 0 and at `$FFFF` instead of wrapping. Vibrato is added on top. Arpeggio is ignored while a note slides (a sliding note has no fixed pitch to arpeggiate around).
- On a drum, the slide and the drum's fall both apply.

### 4.5 Limits

- Player code stays inside the 2 KB goal. Measure and report the size and the time of `music_play` with three music lanes and three effect lanes playing (the worst case).
- Up to 64 effects (`sfx_lo/hi` of 64 bytes each).

## 5. The tracker build's memory map

`inst_slide` is a seventeenth table of 256 bytes. The instrument tables move to `$2000-$30FF`, effects come at `$3100-$37FF`, and the song at `$3800` (it must still end below `$C000`). The runner, the `.prg` export and the `.sid` export follow the new song address. This only concerns the tracker's own image; in a game the developer places everything.

## 6. The tracker

### 6.1 Model

- `project.effects`: a list of `{ name, speed, voice, events }`. `events` uses the pattern event shapes. `voice` (0 to 2) is only where the tracker auditions the effect; the game picks the voice when it calls `sfx_play`.
- Instrument field `slide` (-128 to 127, default 0).
- Validation: at most 64 effects, at most 255 bytes per effect including the `$FF`, effects must fit in `$3100-$37FF`; an effect without events is a problem that blocks export.

### 6.2 Editing and listening

- An Effects list next to the song: add, rename, duplicate, delete, reorder (the position is the effect number).
- Selecting an effect shows its events in a one-voice editor with the same keys and the same editing as a pattern (notes, rests, lengths, instruments, legato, copy and paste), and fields for its speed and audition voice.
- Play effect: starts the effect on its audition voice, whether the song plays or not, so you hear it over the music the way the game will. A key plays the selected effect.
- The instrument editor gets a "Slide" field.

### 6.3 Export

- New file `sfx.asm`: `sfx_lo`, `sfx_hi` and the effect data, plus a constant per effect, `SFX_<NAME> = n`, so the game writes `lda #SFX_EXPLOSION`.
- `instruments.asm` gets `inst_slide`. Song files do not change.
- The `.prg` contains the effects. The `.sid` export ignores them.
- The tracker guide's section on using the files in a game shows `sfx_play`.

## 7. Format

Effects and slides belong to format 2, which is not released yet. So FORMAT stays 2, and the format 2 golden set is made again with an effect and a sliding instrument in it. Migration 1 to 2 adds `slide: 0` to every instrument and `effects: []`. After release 0.2.0, format 2 is frozen. Development autosaves of the earlier format 2 (without effects or slides) must still open: a missing `effects` is read as `[]`, a missing `slide` as 0.

## 8. Checks

- All demo songs: SID writes identical to the current player for 3000 frames each (no effects, slide 0).
- Player tests: an effect starts on the next frame on the chosen voice; the music lane stays quiet during it and resumes at its next note; two effects on two voices at once; replacement and `sfx_stop`; effects without a song and before `music_init`; slides up and down, clamping, slide with vibrato, slide on a drum.
- Model, serialise, export, migration and golden tests, the README test list, and a listen in VICE (x64sc) to an example project with three effects over a song.
- Docs: player.md, the tracker guide, the manual, the README roadmap.

## 9. Calls made without the user (correct them if you like)

- The game picks the voice per call; there is no default voice in the player.
- A new effect replaces the one on that voice; no priorities.
- The music returns at its next note, not in the middle of one.
- Slide unit: 8 frequency register units per step, linear (not in semitones). Linear sounds like the classic game slides and is cheap; a slide in semitones would sound more even across the range but costs a table lookup per frame.
- Arpeggio is ignored on a sliding note.
- The volume is left to the game for effects without a song.
- 64 effects at most; the memory map in section 5.
- Effects carry an audition voice in the project.

## 10. As built

The code follows this design. What it settled or does differently:

- **Effect tables.** Besides `sfx_lo` and `sfx_hi` the area has `sfx_voice` (the audition voice, for the runner's keys and as a suggestion for the game) and `sfx_count`. In the tracker's image the three tables are 64 bytes each, so the effects start at `$31C1`; all effects together may take 1599 bytes. An exported `sfx.asm` has one entry per effect and a constant `SFX_<NAME>` per effect.
- **Requests.** `st_sfx_req` per voice: 0 nothing, n + 1 start effect n, `$FF` stop. The zero state in the file means "nothing", so effects work before `music_init`. A stop silences the voice at once (gate off, no waveform, AD and SR 0).
- **Tick clock of an effect lane.** `st_sfx_fit` and `st_sfx_speed` per voice; `check_release` uses `lane_fit` and `lane_speed`, which hold the music's or the effect's clock for the lane being played.
- **Coming back.** A music lane writes again at its next note start, or as soon as its gate is closed anyway (a rest, or the clean end of a note), so it never resumes in the middle of a note (`st_wait`).
- **Run time.** About 240 cycles more per frame without effects (the checks), about 5500 for the demo song with three effects over it, about 6000 in the frame they start. Six lanes that all start a vibrato in the same frame take about 10,000 cycles; the documents say so.
- **Runner.** Keys 1 to 9 play effects 0 to 8 on their `sfx_voice` (KERNAL `SCNKEY`/`GETIN` in the main loop, because the KERNAL timer interrupt is off).
- **Tracker.** Editing an effect while it plays stops every effect (the tracker writes `$FF` to the three requests with the new bytes). Ctrl/Cmd+Enter, a double click or Enter on the list plays the selected effect. A demo, Sound effects, has six effects over the original tune.
- **Checks.** All seven demo songs give the same SID writes as the player before this work, frame for frame (3000 frames each). The exported files were assembled with ACME at another address and played an effect on the right voice.
