# The player: how to use it, what it does exactly

Companion to [the player data format and timing model](design-player-format-and-timing.md). That document says *what the bytes mean*; this one says *how to call the player*, *where everything lives*, and *what it does in the odd cases*. The source is [`src/music.asm`](../src/music.asm), written to be read: every block has a comment in plain words.

## 1. Files

| File | What | Changes per song? |
|---|---|---|
| `src/music.asm` | the player: code, frequency table, state block (about 1.3 KB of code, 1.5 KB in all) | no |
| `src/instruments.asm` | the instrument tables (15 tables of 256 bytes); the default set has 13 instruments | when you add instruments |
| `src/song_demo.asm` | a short original demo tune | one file per song |
| `src/runner.asm` | a complete program: BASIC line, raster interrupt, the three files above. This is the image the tracker exports | no |
| `web/player/player.prg` | the assembled `runner.asm` (committed, so the browser and Node do not need ACME) | when `src/` changes |
| `web/player/symbols.json` | the addresses of the labels the tracker needs (committed) | when `src/` changes |

Build with `make player` (needs ACME and python3). It writes the two files in `web/player/`. `make` builds the same program as `build/websidtracker.prg`; `make vice` runs it in VICE.

## 2. Using the player in a game

```
        lda #<my_song        ; address of the song header
        ldx #>my_song
        jsr music_init       ; starts the song (volume is set to 15)
        ...
irq     jsr music_play       ; once per frame, from the raster interrupt
        ...
        jsr music_stop       ; silence, st_running = 0
```

- `music_init`: A = low byte, X = high byte of the song header. Clears the SID and the state, puts each voice on the first entry of its order list. The first `music_play` after it plays the first notes. Calling it again switches to another song at once. Clobbers A, X, Y.
- `music_play`: once per frame. It does all SID writes. After a song has ended (all three voices have reached a `stop` entry) it returns at once. Clobbers A, X, Y. It sets the decimal flag off (`cld`), so it is safe to call from an interrupt that did not do so.
- `music_stop`: writes 0 to all 25 SID registers (volume 0 too) and sets `st_running` to 0.
- Pick the song by its label. The player has no song table. Songs in memory at the same time are fine; only the instruments are shared.
- PAL only: the frequency table is for the 985,248 Hz PAL clock, and one `music_play` per frame means 50 Hz.

Put `music.asm` where you like (the file has no `* =`). It needs these labels from you: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release`. The tables may be shorter than 256 bytes if your songs use few instruments.

### Zero page

14 bytes from `zp_music` on (default `$E0` to `$ED`). Define `zp_music` before including `music.asm` to move them. They are scratch: nothing needs to survive between calls except while `music_play` runs. `zp_ptr` (2 bytes) is needed as a zero page pointer for `(zp_ptr),y`; the rest is zero page only because it is shorter and faster there.

The player also uses the stack (at most 10 bytes: the calls nest 5 deep) and writes only to the SID registers `$D400-$D418`, the zero page bytes above and its own area.

## 3. Memory map of the tracker build

| Range | Content |
|---|---|
| `$0801-$0FFF` | BASIC line `10 SYS 2064` and `runner.asm` (screen message, raster interrupt at line 250) |
| `$1000-$1FFF` | `music.asm`: code, then `freq_lo`/`freq_hi` (96 notes), then the state block (`music_size` bytes in all) |
| `$2000-$2EFF` | 15 instrument tables of 256 bytes in this order: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release` |
| `$3000-` | the song (header at `$3000`) |

The runner always does `lda #<$3000 / ldx #>$3000 / jsr music_init`. The tracker patches new instrument tables and a new song into the same image at the same addresses, and the program plays them without being assembled again.

## 4. The state block

All variables are in RAM next to the code, one array of 3 bytes per field (index 0, 1, 2 = voice 1, 2, 3). `symbols.json` has the address of every label below (and more).

Fields the tracker uses:

| Label | Meaning |
|---|---|
| `st_order_pos` | byte offset in the voice's order list (a multiple of 2): the entry of the *current* pattern |
| `st_pat_lo`, `st_pat_hi` | address of the current pattern's first byte |
| `st_pat_pos` | byte offset in the pattern of the *next* event to read |
| `st_ticks_left` | ticks left of the current note or rest. 0: the next event is read at the next tick |
| `st_instr` | the current instrument |
| `st_pitch` | pitch of the current note, transpose included (0 to 95) |
| `st_transpose` | transpose of the current order entry (signed) |
| `st_speed` | frames per tick (read from the song header at every tick) |
| `st_frame_in_tick` | frames left until the next tick; 0 means the next `music_play` is a tick |
| `st_running` | 1 while a song plays, 0 when stopped or finished |

More state, useful for debugging: `st_song_lo/hi` (header address), `st_frames` (frame counter, bit 0 drives the arpeggio), `st_active` (0 = the voice has stopped), `st_gate` (1 = a note sounds), `st_hold` (a legato note follows), `st_age` (frames since the note started, stops at 255), `st_pw_lo/hi/step` (the pulse width now and its sweep step), `st_freq_lo/hi` (a drum's running frequency), `st_vib_cnt`, `st_vib_off_lo/hi`, `st_vib_step_lo/hi` (vibrato), and `out_*` (the seven SID values being written for the current voice). `zp_music` and `music_size` are in the file as well, and so are the table addresses (`freq_lo`, `freq_hi`, `inst_*`).

How the tracker edits live: the player reads the song through the header at every use (the speed at every tick, the order list and pattern table addresses whenever a pattern ends). Only the current pattern's address (`st_pat_lo/hi`), the position in it (`st_pat_pos`) and the order position are kept. After the tracker re-serialises the song it must update those three (and may set `st_ticks_left`) between two `music_play` calls; nothing else depends on the song's addresses.

## 5. Timing, in detail

- One `music_play` = one frame. `st_frame_in_tick` counts down; at 0 the frame is a *tick*: `speed - 1` is stored and the voices read their events. The tick clock is shared, so voices never drift.
- A note or rest of length L lasts L ticks. A voice reads its next event on the tick where `st_ticks_left` has counted down to 0, so the first note of a song starts in the first frame.
- The song speed (header byte 0) is read at every tick. A speed of 0 is treated as 1.
- A song with all voices stopped sets `st_running` to 0 in the frame in which the last voice stops.

### The clean end and the clean start

- **End.** In the last `inst_release` frames of a note (counted in frames, not ticks) the gate is closed and the envelope registers are written as 0 (attack/decay 0, sustain/release 0). The SID then drops to silence within about 7 ms, and the envelope is empty when the next note starts. The release nibble in `inst_sr` is therefore never heard.
- **Start.** A new note writes, in this order: the control register with the waveform, the TEST bit and the gate *low* (this also holds the oscillator at zero, so every note starts from the same phase, and makes the gate open even if the previous note had not closed it); then frequency, pulse width, attack/decay, sustain/release; then the control register with the gate open, last. The order of the SID writes in a frame is always the same: voice 1, voice 2, voice 3, each frequency, pulse width, envelope, control.
- The values are the same for every frame of a note: the player writes all seven registers of a sounding voice every frame (the registers hold the value if it did not change).

Decisions for the edge cases:

| Case | What happens |
|---|---|
| `inst_release` as long as or longer than the note | the first frame of every note always sounds; the rest of the note is the clean end. With speed 6, a 1-tick note and release 2: 4 frames sound, 2 are silent. |
| speed 1, release 2 | a 1-tick note sounds for one frame, a 2-tick note for one frame (the gate is closed in the second), a 3-tick note needs 3 ticks to sound at all (1 frame). |
| `inst_release` = 0 | treated as 1: the gate must go down at least once between two notes. |
| `inst_release` above 32 | treated as 32. (The check adds up the ticks left; a very long release would make `music_play` slow.) |
| a note of length 0 | counts as 1 tick |
| a rest | gate closed at once, envelope registers 0. The note before the rest has already done its own clean end. |
| legato (`$62`) | The note *before* the marker does not close its gate (the player looks at the byte after the note), and the note *after* it only changes the pitch: no gate, no envelope write, no restart of the pulse sweep, vibrato or arpeggio. The marker must come directly after the note it follows. If nothing sounds at that moment (after a rest, at the start of a song, or after a note that ended) the legato note is an ordinary new note. A legato drum keeps its falling tone running. |
| unknown event bytes (`$63` to `$FE`) | skipped one byte at a time. They are reserved: do not use them. |
| `$FF` in a pattern | end of pattern. A pattern without `$FF` runs into whatever follows in memory. |
| a voice with an empty pattern, or a loop to an entry that loops | at most 16 order entries in a row may pass without a note or rest; after that the voice stops. The song cannot hang the player. |
| pitch outside 0 to 95 | the pitch after the transpose is clamped (95 + 12 plays 95, 5 - 12 plays 0). The same for the arpeggio offset. |

## 6. The instrument features, in detail

All features run every frame. The values come from the instrument tables of the *current* instrument at that moment, so the tracker can change `inst_*` while a note sounds (the fields that matter at the note start, waveform, envelope and start pulse width, apply from the next note; the sweep step applies from the next note too).

- **Waveform.** `inst_wave` bits 7 to 4 are the waveform (triangle `$10`, saw `$20`, pulse `$40`, noise `$80`), bits 2 and 1 are ring and sync. Bit 0 (gate) and bit 3 (test) are cleared by the player: it decides about those.
- **Envelope.** `inst_ad`, `inst_sr` are written while the gate is open, and 0 while it is closed.
- **Pulse sweep.** `inst_pw_lo/hi` is the start width (12 bits) and `inst_pw_step` the signed amount added every frame (0 = no sweep). `inst_pw_min/max` are in units of 16. When the width divided by 16 reaches `max` going up, or `min` going down, the width is put exactly on that limit and the direction reverses. The reversal is `eor #$FF`, "minus the step, minus one": a step of +20 turns into -21 and back into +20. A start width outside the limits is pulled in. A sweep that runs out of the 12-bit range counts as having reached the limit on that side.
- **Vibrato.** After `inst_vib_delay` frames (the note's age) the pitch swings like a triangle around the note. The peak deviation is `inst_vib_depth` / 16 of the distance to the semitone *below* the note (the table value of the note minus the one before it; for the lowest note the one above), to each side. So depth 8 is half a semitone up and half down, and it sounds equally wide in bass and treble. `inst_vib_speed` is the number of frames of one swing from one side to the other, so the full period is twice that. The first swing starts at the note's pitch and is half as long. An odd speed is rounded down to the even number below it, and a speed below 2 is treated as 2 (so that the first half-swing is a whole number of frames and the vibrato stays symmetrical). Depth above 127 is treated as 127. If the sum would go past the table range it stops at `$FFFF` or 0 instead of wrapping around. The step per frame is worked out once when the vibrato starts (a multiplication and a division, about 1000 cycles); changing the depth live therefore needs a new note, but 0 switches it off at once.
- **Arpeggio.** On odd frames (bit 0 of `st_frames`, the same for all voices) the pitch is the note plus `inst_arp` semitones, clamped; on even frames it is the note. So the pitch alternates every frame, at 25 Hz.
- **Drum.** `inst_drum_noise` > 0 makes the instrument a drum. For that many frames the control register has the noise waveform (and only that) at the frequency of the note. After that it has the waveform of `inst_wave` at the same frequency, and from the next frame on the frequency falls by `inst_drum_fall` (register units, about 17 per Hz) per frame, to a minimum of 0. Vibrato and arpeggio are not applied to a drum. The pulse sweep is (it matters if the drum waveform is pulse). If `inst_wave` is noise the "tone" is noise that gets darker.

## 7. Limits of the format as implemented

| Limit | Value | Why |
|---|---|---|
| bytes in one pattern (the `$FF` included) | 255 | `st_pat_pos` is one byte |
| order list entries per voice (stop and loop entries included) | 128 | `st_order_pos` is one byte |
| pattern numbers | 0 to 253 (`$FE`, `$FF` are the stop and loop codes in an order list) | |
| patterns in one song | 254 | |
| instruments | 256 | the tables are indexed by one byte |
| transpose | -128 to 127 as a signed byte (the tracker allows -96 to 96) | |
| loop target | entry 0 to 127 | |
| speed | 1 to 255 | |

## 8. Run time (measured)

Measured in our 6502 core, cycles from the first instruction of `music_play` to its `rts`, so without the 6 cycles of the `jsr` (a PAL frame has 19,656 cycles); `web/player/test.mjs` prints the numbers.

| Case | Cycles |
|---|---|
| demo song, 64 seconds (3200 frames), average | about 1600 (8 percent of a frame) |
| demo song, longest frame | about 3300 (17 percent of a frame) |
| worst case made on purpose: speed 1, vibrato starts on all three voices in the same frame, big sweep and arpeggio | about 4900 |
| the same with `inst_release` 32 (or more) | about 7900 |
| music over (all voices stopped) | 12 |

A normal frame is cheap and steady: three voices, each with a few table lookups and seven SID writes. The longer frames are the ones where something starts: a vibrato (the division), a new pattern. The interrupt itself adds about 70 cycles (KERNAL entry, the acknowledge, `jmp $EA81`). There are no unbounded loops: the loops depend on the length of an order-list chain (16 at most) and on `inst_release` (32 at most).

## 9. How it was checked

- `node --test web/player/test.mjs`: 38 tests. They load `player.prg` into the JavaScript 6502 core, write tiny songs and instruments, call `music_init` and `music_play` like the interrupt does, and check the SID writes with their cycle numbers (pitch, gate, envelope, order of writes, timing of the clean end, edge cases above, state block values, loop, stop, transpose, pulse sweep, vibrato, arpeggio, drum, legato, broken songs, run time). Two tests render audio with the SID emulation and measure the pitch of notes. `WAV_DIR=somewhere node --test web/player/test.mjs` also writes the demo song as a WAV file.
- In VICE (`x64sc`, the accurate emulator), with a test image made by patching other instruments and songs into `player.prg`: ten pulse notes from A-2 to A-6 and others measured within 0.3 cents of the equal-tempered pitch; 48 drum hits (kick, snare, hat, 16 each) with the same energy in every hit within a few percent, a kick whose tone falls by the expected 8.8 Hz per frame after a one-frame noise click, silence (below 20 of 32768) between hits; a vibrato that stays silent for the delay and then swings +-50 cents; and the demo song, whose second round is aligned to the first one at exactly 768 frames. The recipe: `x64sc -remotemonitor -sound -sounddev wav -soundarg out.wav -autostart some.prg`, wait, then send `quit` to the remote monitor (`nc 127.0.0.1 6510`) so that the WAV gets its header; analyse the WAV with a FFT per frame.
- Sound is still judged by ear: the numbers above say nothing about taste.

## 10. Known limits and open points

- The noise generator is not reset between hits (the TEST bit is held only for a few cycles; the chip needs a long time for that), so two hits of the same noise drum are the same in character but not sample for sample.
- Legato must follow its note directly in the same pattern; at a pattern boundary it starts a new note.
- NTSC: the frequency table is PAL only, and a 60 Hz interrupt plays everything 20 percent too fast.
- There is no filter, no volume per voice, no portamento and no sound effect support yet (see section 9 of the design document). The event bytes `$63` to `$7F` and the unused `$80` to `$FE` are reserved for them.
