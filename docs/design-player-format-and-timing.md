# Player data format and timing model, version 1

Status: draft for review. Nothing is built yet.
Companion to [the concept document](concept-hubbard-inspired-player.md), which answers *why*. This document answers *how the bytes look and when things happen*.

Clean-room note: every layout below is our own design. Where the concept document describes an idea (patterns, an order list, instruments as parameter records) the byte layout and structure here were chosen on purpose to differ from any existing player. No third-party code, tables or labels were used. The frequency table is computed from the SID formula, not copied.

## 1. Intent

A small C64 music player (target: 2 KB or less of code) whose songs are tiny and whose sound comes from changing the SID every frame, in the spirit of the classic game composers: pulse-width sweep, late vibrato, arpeggio and drums on any voice. A browser tracker writes the data; another developer drops three kinds of files into their game and plays music with two calls.

## 2. Goals, non-goals, anti-goals

Goals
- Hubbard-style sound from four per-frame instrument features: pulse sweep, vibrato with late start, arpeggio, drum.
- Songs are note-with-length streams in short shared patterns, not rows.
- Clean, repeatable note starts (no random clicks, see 6).
- A player small and plain enough to read in an afternoon. Clarity wins over saving the last byte.

Non-goals for version 1
- No filter, no portamento, no volume per voice (global volume is set by the game).
- No tempo changes inside a song. One fixed speed per song.
- No sound effects (the design must not make them impossible later, see 9).
- PAL only (50 Hz). NTSC later.
- No compatibility with any other player's or tracker's format.

Anti-goals
- A near-copy of anybody's player or data layout.
- Features that make the player hard to read, to save a few bytes.

## 3. Files a game developer uses

| File | Content | Changes per song? |
|---|---|---|
| `music.asm` | the player | no |
| `instruments.asm` | one shared instrument set, used by every song | no (grows as you add instruments) |
| `song_<name>.asm` | one song | yes, one file per song |

Interface (the contract between game and player):
- `music_init`: A = low byte, X = high byte of the song's header address. Starts that song. The game picks a song simply by using its label, e.g. `lda #<song_title : ldx #>song_title : jsr music_init`. The player has no song table.
- `music_play`: call once per frame from the raster interrupt. All SID writes for the three voices happen here.
- `music_stop`: silences the three voices and stops.
- `instruments.asm` must define the field tables listed in 5. The player refers to them by label.

State block: all per-voice state (order position, pattern position, ticks left, current instrument, pitch, counters) lives at fixed, documented addresses, one array per field, and `music.asm` exports their symbols. The tracker reads and adjusts them while the song plays.

Zero page: a handful of pointer bytes, chosen in `main.asm` or `hardware.asm` (the exact addresses are fixed in the source and documented there).

## 4. Song data (`song_<name>.asm`)

### 4.1 Header (9 bytes)

| Offset | Size | Meaning |
|---|---|---|
| 0 | 1 | speed: frames per tick, 1 to 255 |
| 1 | 2 | address of the order list of voice 1 |
| 3 | 2 | address of the order list of voice 2 |
| 5 | 2 | address of the order list of voice 3 |
| 7 | 2 | address of the pattern table |

All words are low byte first. Patterns are numbered per song (0 up to 255), so songs do not share pattern numbers.

### 4.2 Pattern table

A list of 2-byte addresses, pattern 0 first. Entry n is at `pattern_table + 2*n`.

### 4.3 Order list (one per voice)

A sequence of 2-byte entries:

| Byte 1 | Byte 2 | Meaning |
|---|---|---|
| pattern number 0 to $FD | transpose in semitones, signed | play that pattern, every note shifted by the transpose |
| $FE | - | stop this voice |
| $FF | entry number | loop: continue at that entry (entry 0 is the first one) |

Transpose is in because it is the cheapest way to get new music from old data (the same bass pattern a fourth higher costs two bytes). A transposed pitch is clamped to the table range 0 to 95.

### 4.4 Pattern events

A pattern is a stream of events, ended by $FF. The first byte of an event says what it is.

| First byte | Following | Meaning |
|---|---|---|
| $00 to $5F | length (1 byte) | a note: pitch 0 to 95 (0 = C-0, 12 notes per octave), lasting `length` ticks (1 to 255) |
| $60 | length | a rest of `length` ticks (voice is silent) |
| $61 | instrument number | switch to that instrument; stays until switched again |
| $62 | - | the next note is legato: it changes pitch without restarting the envelope |
| $FF | - | end of pattern |
| other | - | reserved, must not be used |

A voice starts with instrument 0. Note and length are one pair, and an instrument switch is its own event, so a plain note costs two bytes and a switch costs two bytes only when the instrument really changes.

For a drum instrument (see 5) the pitch of the note is the pitch where the falling tone begins.

### 4.5 Worked example

A bass voice that plays four notes on instrument 2, then repeats. Speed 6 frames per tick. Numbers in hex.

```
song_demo
        !byte 6                         ; speed
        !word order_v1, order_v2, order_v3
        !word pattern_table

pattern_table
        !word pat_bass, pat_lead

order_v1
        !byte 0, 0                      ; pattern 0, no transpose
        !byte $FF, 0                    ; loop to entry 0

pat_bass
        !byte $61, 2                    ; instrument 2
        !byte $18, 4                    ; C-2, 4 ticks
        !byte $18, 4                    ; C-2, 4 ticks
        !byte $60, 4                    ; rest, 4 ticks
        !byte $1F, 4                    ; G-2, 4 ticks
        !byte $FF                       ; end of pattern
```

The pattern is 12 bytes, the order list 4 bytes.

## 5. Instrument data (`instruments.asm`)

An instrument is a set of fields. The file stores them as **one table per field**, indexed by the instrument number (0 to 255 possible). For the 6502 this means the player does `ldy instrument` and `lda inst_ad,y`: no multiplication, no record size limit. The tracker writes the tables; they are not meant to be edited by hand.

| Table | Meaning |
|---|---|
| `inst_wave` | the control register value without the gate bit: waveform (bits 7 to 4), plus ring and sync if wanted |
| `inst_ad` | attack/decay, as the SID register |
| `inst_sr` | sustain/release, as the SID register |
| `inst_pw_lo`, `inst_pw_hi` | starting pulse width (12 bits) |
| `inst_pw_step` | pulse sweep: signed amount added to the pulse width every frame; 0 = no sweep |
| `inst_pw_min`, `inst_pw_max` | sweep limits, in units of 16 (that is, pulse width / 16); the sweep reverses at a limit |
| `inst_vib_delay` | frames after the note start before vibrato begins |
| `inst_vib_depth` | vibrato width in 1/16ths of the distance to the neighbouring semitone; 0 = no vibrato |
| `inst_vib_speed` | frames per half period of the vibrato |
| `inst_arp` | arpeggio: signed semitone offset; the pitch alternates every frame between the note and the note plus this offset; 0 = off |
| `inst_drum_noise` | drum: number of frames of noise at the start; 0 = not a drum |
| `inst_drum_fall` | drum: after the noise, the tone (waveform in `inst_wave`) starts at the note's pitch and falls by this amount (frequency register units) every frame |
| `inst_release` | frames at the end of every note reserved for the clean restart (see 6); standard value 2 |

Vibrato is a fraction of the distance to the next semitone, so it sounds equally wide in bass and treble. It is not added to a drum.

## 6. Timing model

### 6.1 Ticks and frames

- `music_play` runs once per frame (50 per second).
- One tick is `speed` frames. A note of `length` ticks lasts `length * speed` frames.
- A new event is read only on the first frame of a tick. All per-frame features (pulse sweep, vibrato, arpeggio, drum fall) run on every frame, ticks or not.
- The three voices share one tick clock, so they stay in step. They never drift against each other.

### 6.2 Clean note start and end

This exists to fix a problem we heard in an earlier prototype: drum hits with random, irregular clicks and hiss. The SID envelope remembers its previous state, so starting a note while the old envelope is still running can start the new attack late or wrong. Two rules:

1. **The last `inst_release` frames of every note are the clean-end frames.** At that moment the gate is cleared and attack/decay and sustain/release are written as zero, so the envelope is empty when the next note begins. The value is counted in **frames, not ticks**, so a 1-frame tick still gets a full restart.
2. **A note start writes the envelope registers first and the gate last.**

Edge cases the implementation must settle and document:
- If `inst_release` is as long as the note, clamp it so the note sounds at least 1 frame. With speed 1 and `inst_release` 2 a note needs 3 ticks to sound at all.
- A legato note (event $62) skips rule 1 for the note before it and rule 2 for itself.
- A rest starts the same clean end as a note.

### 6.3 Per-frame order of work for one voice

1. If this is the first frame of a tick and the current event is over, read the next event(s). Pattern end: take the next order-list entry. Order list end: stop or loop.
2. If a note starts: apply the clean start (6.2), set pitch, set the pulse width from the instrument, reset vibrato, arpeggio and drum counters.
3. Run the per-frame features of the current instrument, write the voice's SID registers.
4. If the note is within `inst_release` frames of its end, do the clean end.

The order of the SID writes within a frame is fixed once and the same for every voice, so timing relative to the raster line does not change from frame to frame.

## 7. The tracker side

- The tracker holds the song and instrument set, shows note-with-length as a grid with one row per tick, and exports the three file kinds above. The grid is only a view; the stored data is the stream of 4.4.
- The tracker plays the song by running the real 6502 player in its own small emulator, so what you hear is what the game gets. There is no second implementation of the player. See [the architecture document](design-web-tracker-architecture.md).
- Instrument numbers in the set are stable. Deleting or reordering must not break a song that uses them (the tracker warns instead).
- The tracker shows the byte size of the set and of each song.

## 8. Constraints

- Player code about 2 KB or less, plain 6502 (no illegal opcodes), ACME syntax.
- Plays on a real PAL C64: the raster interrupt may call `music_play` at any line, so its run time must be steady and short. Measure it, report it.
- Sound is judged by ear in VICE x64sc, not only by measurement.

## 9. Left for later (the format must not prevent them)

- Sound effects that borrow a voice. The player's per-voice state must be separable so an effect can take a voice and give it back.
- Filter, portamento, volume per voice. Reserve a free value space in pattern events ($63 to $7F) and an unused instrument table slot for them.
- NTSC frequency table.

## 10. Decisions and open choices

Decided:
- Three kinds of files: a shared instruments file, several song files, the player.
- One fixed speed per song.
- Note-with-length streams, not rows.
- All four per-frame features in version 1: pulse sweep, vibrato, arpeggio, drum.
- Drums on any voice.
- Clean restart counted in frames, per instrument, standard 2.
- No filter in version 1.

Choices that are made but can still change while the first player is built (feedback from game developers is welcome):
- Order-list entries are two bytes with a transpose; loop to an entry number.
- Legato as its own event ($62) and not as a flag in the note byte.
- Instruments stored as one table per field, not as 8 or 16 byte records.
- Songs started by passing a header address, no song-number table.
- Pitch range 96 notes, PAL only.
- Pulse limits in units of 16, vibrato depth in 1/16ths, drum fall in frequency register units.
- The voice state lives in a state block at fixed addresses, so the tracker can follow and adjust the playhead while it edits.
