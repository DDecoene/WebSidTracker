# The player: how to use it, what it does exactly

Companion to [the player data format and timing model](design-player-format-and-timing.md). That document says *what the bytes mean*; this one says *how to call the player*, *where everything lives*, and *what it does in the odd cases*. The source is [`src/music.asm`](../src/music.asm), written to be read: every block has a comment in plain words.

## 1. Files

| File | What | Changes per song? |
|---|---|---|
| `src/music.asm` | the player: code, frequency table, state block (about 1.7 KB of code, 2 KB in all) | no |
| `src/instruments.asm` | the instrument tables (17 tables of 256 bytes); the default set has 16 instruments, three of them for the effects | when you add instruments |
| `src/sfx.asm` | the sound effects: `sfx_lo`, `sfx_hi`, `sfx_voice` (64 entries here), `sfx_count`, three example effects | when you add effects |
| `src/song_demo.asm` | a short original demo tune | one file per song |
| `src/runner.asm` | a complete program: BASIC line, raster interrupt, the four files above, keys 1 to 9 for the effects. This is the image the tracker exports | no |
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
        jsr music_stop       ; silence, st_running = 0, no effects
        ...
        lda #SFX_BOOM        ; a sound effect (constant from sfx.asm)
        ldx #2               ; on voice 3
        jsr sfx_play         ; starts at the next music_play
```

- `music_init`: A = low byte, X = high byte of the song header. Clears the SID and the state, puts each voice on the first entry of its order list. The first `music_play` after it plays the first notes. Calling it again switches to another song at once. Clobbers A, X, Y.
- `music_play`: once per frame, also when no song plays: it plays the sound effects as well. It does all SID writes. After a song has ended (all three voices have reached a `stop` entry) only the effects are played. Clobbers A, X, Y. It sets the decimal flag off (`cld`), so it is safe to call from an interrupt that did not do so.
- `music_stop`: writes 0 to all 25 SID registers (volume 0 too), sets `st_running` to 0 and ends every effect.
- `sfx_play`: A = effect number, X = SID voice (0, 1 or 2). It only stores the request (`st_sfx_req`) and changes A; the effect starts at the next `music_play`, so it can be called from the main loop while `music_play` runs in the interrupt. A new effect on a voice replaces the one that plays there. `sfx_stop`: X = voice, stops the effect there at the next `music_play` (gate off, no waveform, the fastest release).
- While an effect plays on a voice, the music of that voice keeps counting (positions, ticks, envelope, vibrato) but does not write to the SID. When the effect ends the music stays quiet until its next note starts (a legato note does not count) or until its gate is closed anyway, so it never comes back in the middle of a note. A game that plays effects without ever calling `music_init` must set the volume (`$D418`) itself.
- Pick the song by its label. The player has no song table. Songs in memory at the same time are fine; only the instruments are shared.
- PAL only: the frequency table is for the 985,248 Hz PAL clock, and one `music_play` per frame means 50 Hz.

Put `music.asm` where you like (the file has no `* =`). It needs these labels from you: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release`, `inst_arp2`, `inst_slide`, and from `sfx.asm` `sfx_lo` and `sfx_hi` (an exported `sfx.asm` with no effects still has them). The tables may be shorter than 256 bytes if your songs use few instruments.

### Zero page

14 bytes from `zp_music` on (default `$E0` to `$ED`). Define `zp_music` before including `music.asm` to move them. They are scratch: nothing needs to survive between calls except while `music_play` runs. `zp_ptr` (2 bytes) is needed as a zero page pointer for `(zp_ptr),y`; the rest is zero page only because it is shorter and faster there.

The player also uses the stack (at most 10 bytes: the calls nest 5 deep) and writes only to the SID registers `$D400-$D418`, the zero page bytes above and its own area.

## 3. Memory map of the tracker build

| Range | Content |
|---|---|
| `$0801-$0FFF` | BASIC line `10 SYS 2064` and `runner.asm` (screen message, raster interrupt at line 250) |
| `$1000-$1FFF` | `music.asm`: code, then `freq_lo`/`freq_hi` (96 notes), then the state block (`music_size` bytes in all) |
| `$2000-$30FF` | 17 instrument tables of 256 bytes in this order: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release`, `inst_arp2`, `inst_slide` |
| `$3100-$37FF` | the sound effects: `sfx_lo` (`$3100`), `sfx_hi` (`$3140`), `sfx_voice` (`$3180`), 64 bytes each, `sfx_count` (`$31C0`), then the effects |
| `$3800-` | the song (header at `$3800`) |

The runner always does `lda #<$3800 / ldx #>$3800 / jsr music_init`, then waits for the keys 1 to 9 (KERNAL `SCNKEY` and `GETIN` in its main loop) and plays effect 0 to 8, if it exists (`sfx_count`), on the voice in `sfx_voice`. The tracker patches new instrument tables, effects and a new song into the same image at the same addresses, and the program plays them without being assembled again.

## 4. The state block

All variables are in RAM next to the code. The per-voice fields are arrays of 6 bytes, one per *lane*: index 0, 1, 2 are the music on voice 1, 2, 3, index 3, 4, 5 the sound effects on voice 1, 2, 3. The tracker uses indexes 0 to 2. `symbols.json` has the address of every label below (and more).

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

More state, useful for debugging: `st_song_lo/hi` (header address), `st_frames` (frame counter, bit 0 drives the two-note arpeggio), `st_arp_step` (counts 0, 1, 2 and round again, one step per frame: the step of the three-note arpeggio), `st_active` (0 = the voice has stopped), `st_gate` (1 = a note sounds), `st_hold` (a legato note follows), `st_age` (frames since the note started, stops at 255), `st_pw_lo/hi/step` (the pulse width now and its sweep step), `st_freq_lo/hi` (the running frequency of a drum or a sliding note), `st_vib_cnt`, `st_vib_off_lo/hi`, `st_vib_step_lo/hi` (vibrato), `out_*` (the seven SID values being written for the current lane), `lane_fit`/`lane_speed` (the tick clock of the lane being played), and per SID voice (3 bytes): `st_sfx_req` (0 nothing, n + 1 start effect n, `$FF` stop), `st_sfx_fit` and `st_sfx_speed` (the effect's own tick clock), `st_wait` (1 = the music waits for its next note after an effect). `zp_music` and `music_size` are in the file as well, and so are the table addresses (`freq_lo`, `freq_hi`, `inst_*`).

How the tracker edits live: the player reads the song through the header at every use (the speed at every tick, the order list and pattern table addresses whenever a pattern ends). Only the current pattern's address (`st_pat_lo/hi`), the position in it (`st_pat_pos`) and the order position are kept. After the tracker re-serialises the song it must update those three (and may set `st_ticks_left`) between two `music_play` calls; nothing else depends on the song's addresses.

## 5. Timing, in detail

- One `music_play` = one frame. `st_frame_in_tick` counts down; at 0 the frame is a *tick*: `speed - 1` is stored and the voices read their events. The tick clock is shared, so voices never drift.
- A note or rest of length L lasts L ticks. A voice reads its next event on the tick where `st_ticks_left` has counted down to 0, so the first note of a song starts in the first frame.
- The song speed (header byte 0) is read at every tick. A speed of 0 is treated as 1.
- A song with all voices stopped sets `st_running` to 0 in the frame in which the last voice stops.

### The clean end and the clean start

- **End.** In the last `inst_release` frames of a note (counted in frames, not ticks) the gate is closed and the envelope registers are written as 0 (attack/decay 0, sustain/release 0). The SID then drops to silence within about 7 ms, and the envelope is empty when the next note starts.
- **Start.** A new note writes, in this order: the control register with the waveform, the TEST bit and the gate *low* (this also holds the oscillator at zero, so every note starts from the same phase, and makes the gate open even if the previous note had not closed it); then frequency, pulse width, attack/decay (with the decay nibble set equal to the attack nibble, see below), sustain/release; then the control register with the gate open; then attack/decay once more with the real values. The order of the SID writes in a frame is always the same: voice 1, voice 2, voice 3, each frequency, pulse width, envelope, control.
- The values are the same for every frame of a note: the player writes all seven registers of a sounding voice every frame (the registers hold the value if it did not change).

### Why the player does this: the SID's rate counter

The envelope generator of the SID has a 15-bit *rate counter* that counts cycles and is **never reset when the rate changes**. A step of the envelope happens when the counter equals the period of the selected rate (9 cycles for rate 0; 32 for rate 1, and so on up to 31251). If the period is changed to a value *below* the counter, the counter has to run on to 32768, wrap around to 0 and count up again: up to 33 ms (just under two frames) in which the envelope does nothing. This is real chip behaviour (the "ADSR delay bug"), also seen in VICE; it is not an emulator artefact. It hit the player in three places, and each has a rule:

1. **Release nibble.** The player used to write the instrument's `inst_sr` as it was, release nibble included, a few cycles before the gate opened. A non-zero release nibble lets the counter run past 9 while the voice waits, and an attack of 0 (a step every 9 cycles) then waits for the wrap: the note started about 34 ms (two frames) late. Now only the **sustain nibble (high nibble) of `inst_sr` is used**; the low nibble is written as 0. The release nibble was never heard anyway (the clean end writes SR = 0). The exported instrument tables keep the byte as the user typed it; the tracker warns when the low nibble is not 0.
2. **The decay rate at gate-on.** For one cycle after the gate opens the SID uses the *decay* rate before it switches to the attack rate. With attack 0 and a decay above 0, about one gate-on in nine falls exactly on the cycle where the counter is one step from 9, misses it, and has to go all the way round: again a note two frames late. So a new note writes AD with the decay nibble equal to the attack nibble before the gate opens (the rate does not change), and the real AD a few cycles after the gate.
3. **The gate-off needs time.** The clean end (gate off, AD = SR = 0) switches the rate to 9 and starts the same wait (up to 33 ms) before the release begins. If the next note opens its gate before that wait is over, its attack is stuck behind it. Two frames (39 ms) are enough. So, **when the instrument's decay is above 0, `inst_release` 0 and 1 are played as 2**, and **a note of 1 or 2 frames never closes its gate** (a gate-off of one frame is too short; the next note restarts the gate itself, with the test write above). When the decay is 0 the sustain already runs at the fastest rate, nothing has to wait, and a release of 1 frame is fine (0 is played as 1).

The result, measured with the real SID code (see section 9): every note that follows a clean end starts on its tick frame, for all attacks, decays, sustains, speeds 1 to 8 and all 9 alignments of the writes; notes of 1 or 2 frames (no clean end is possible) start with a restart in one frame, which can still be a little late if the previous note was an almost silent plucked sound. Use notes of 3 frames or more where you can.

Decisions for the edge cases:

| Case | What happens |
|---|---|
| `inst_release` as long as or longer than the note | the first frame of every note always sounds; the rest of the note is the clean end. With speed 6, a 1-tick note and release 2: 4 frames sound, 2 are silent. |
| speed 1, release 2, decay 0 | a 1-tick note sounds for one frame, a 2-tick note for one frame (the gate is closed in the second), a 3-tick note needs 3 ticks to sound at all (1 frame). |
| speed 1, decay above 0 | a 1-tick or 2-tick note keeps its gate open to its end (1 or 2 frames of sound); a 3-tick note sounds 1 frame, then 2 frames of clean end. |
| `inst_release` = 0 or 1, decay above 0 | played as 2 (see above). |
| `inst_release` = 0, decay 0 | played as 1: the gate must go down at least once between two notes. |
| `inst_release` above 32 | treated as 32. (The check adds up the ticks left; a very long release would make `music_play` slow.) |
| a note of length 0 | counts as 1 tick |
| a rest | gate closed at once, envelope registers 0. The note before the rest has already done its own clean end. |
| legato (`$62`) | The note *before* the marker does not close its gate (the player looks at the byte after the note), and the note *after* it only changes the pitch: no gate, no envelope write, no restart of the pulse sweep, vibrato or arpeggio. The marker must come directly after the note it follows. If nothing sounds at that moment (after a rest, at the start of a song, or after a note that ended) the legato note is an ordinary new note. A legato drum keeps its falling tone running. |
| unknown event bytes (`$63` to `$FE`) | skipped one byte at a time. They are reserved: do not use them. |
| `$FF` in a pattern | end of pattern. A pattern without `$FF` runs into whatever follows in memory. |
| a voice with an empty pattern, or a loop to an entry that loops | at most 16 order entries in a row may pass without a note or rest; after that the voice stops. The song cannot hang the player. |
| pitch outside 0 to 95 | the pitch after the transpose is clamped (95 + 12 plays 95, 5 - 12 plays 0). The same for the two arpeggio offsets. |

## 6. The instrument features, in detail

All features run every frame. The values come from the instrument tables of the *current* instrument at that moment, so the tracker can change `inst_*` while a note sounds (the fields that matter at the note start, waveform, envelope and start pulse width, apply from the next note; the sweep step applies from the next note too).

- **Waveform.** `inst_wave` bits 7 to 4 are the waveform (triangle `$10`, saw `$20`, pulse `$40`, noise `$80`), bits 2 and 1 are ring and sync. Bit 0 (gate) and bit 3 (test) are cleared by the player: it decides about those.
- **Envelope.** `inst_ad` and the sustain nibble of `inst_sr` are written while the gate is open, and 0 while it is closed. The release nibble of `inst_sr` is ignored.
- **Pulse sweep.** `inst_pw_lo/hi` is the start width (12 bits) and `inst_pw_step` the signed amount added every frame (0 = no sweep). `inst_pw_min/max` are in units of 16. When the width divided by 16 reaches `max` going up, or `min` going down, the width is put exactly on that limit and the direction reverses. The reversal is `eor #$FF`, "minus the step, minus one": a step of +20 turns into -21 and back into +20. A start width outside the limits is pulled in. A sweep that runs out of the 12-bit range counts as having reached the limit on that side.
- **Vibrato.** After `inst_vib_delay` frames (the note's age) the pitch swings like a triangle around the note. The peak deviation is `inst_vib_depth` / 16 of the distance to the semitone *below* the note (the table value of the note minus the one before it; for the lowest note the one above), to each side. So depth 8 is half a semitone up and half down, and it sounds equally wide in bass and treble. `inst_vib_speed` is the number of frames of one swing from one side to the other, so the full period is twice that. The first swing starts at the note's pitch and is half as long. An odd speed is rounded down to the even number below it, and a speed below 2 is treated as 2 (so that the first half-swing is a whole number of frames and the vibrato stays symmetrical). Depth above 127 is treated as 127. If the sum would go past the table range it stops at `$FFFF` or 0 instead of wrapping around. The step per frame is worked out once when the vibrato starts (a multiplication and a division, about 1000 cycles); changing the depth live therefore needs a new note, but 0 switches it off at once.
- **Arpeggio.** Two offsets in semitones, both signed: `inst_arp` and `inst_arp2`. With `inst_arp2` = 0 the arpeggio has two notes: on odd frames (bit 0 of `st_frames`) the pitch is the note plus `inst_arp`, clamped; on even frames it is the note. So the pitch alternates every frame, at 25 Hz. With `inst_arp2` not 0 it has three notes, one frame each: the note (when `st_arp_step` is 0), the note plus `inst_arp` (1), the note plus `inst_arp2` (2). A round is three frames, 16.7 Hz. Offsets 4 and 7 make a major chord, 3 and 7 a minor one. If `inst_arp` is 0 there, step 1 plays the note itself. Both counters are shared by the three voices and run on from `music_init`; a new note does not reset them, so a note can begin on any step. The second offset came with format 2; with 0 in it the player makes the same SID writes as the player of format 1.
- **Slide.** `inst_slide` is signed; 0 is off. From the second frame of a note (`advance_voice`, at the end of every frame) the running frequency `st_freq` moves by `inst_slide` times 8, up for a positive value: about 1000 register units per frame at most, so two octaves of a high note in a quarter of a second. It is linear in frequency, so a high note slides faster in semitones than a low one. It stops at `$FFFF` and at 0. The vibrato is added on top; the arpeggio is not used on a sliding note. A legato note on a sliding instrument slides on from where the previous one was (`st_freq` is only set when a note really starts). On a drum the slide and the fall both apply.
- **Drum.** `inst_drum_noise` > 0 makes the instrument a drum. For that many frames the control register has the noise waveform (and only that) at the frequency of the note. After that it has the waveform of `inst_wave` at the same frequency, and from the next frame on the frequency falls by `inst_drum_fall` (register units, about 17 per Hz) per frame, to a minimum of 0. Vibrato and arpeggio are not applied to a drum. The pulse sweep is (it matters if the drum waveform is pulse). If `inst_wave` is noise the "tone" is noise that gets darker.

## 6b. Version

`music.asm` has `format_version` and `release_major`, `release_minor`, `release_patch` as constants (they produce no bytes; `symbols.json` has them as labels) and a comment line `; websidtracker format N, release X.Y.Z`. The format version is shared with the project file and the exported asm files: it rises when anything in the byte formats changes (see [releasing.md](releasing.md)). A test hashes what defines the format (table names and order, event codes, header size, the layout of the state block relative to its first byte, the addresses of the instrument tables) and fails if the hash changes without a new format version. Bug fixes and sound changes do not change it. It cannot see a change of meaning that keeps the same bytes, such as how a field is read; that has to be caught in review.

Format 2 added the instrument tables `inst_arp2` and `inst_slide` (after the other tables, so those kept their addresses), the state byte `st_arp_step`, the effect lanes (the per-voice arrays grew from 3 to 6 bytes) and the effect state, and the effect tables `sfx_lo`/`sfx_hi`. All of it before release 0.2.0, the first with format 2.

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
| sound effects | 64 in the tracker (any number up to 256 in your own `sfx.asm`) | `sfx_lo`/`sfx_hi` are indexed by one byte |
| bytes in one effect (speed and `$FF` included) | 255 | `st_pat_pos` is one byte |

## 8. Run time (measured)

Measured in our 6502 core, cycles from the first instruction of `music_play` to its `rts`, so without the 6 cycles of the `jsr` (a PAL frame has 19,656 cycles); `web/player/test.mjs` prints the numbers.

| Case | Cycles |
|---|---|
| demo song, 64 seconds (3200 frames), average | about 2000 (10 percent of a frame) |
| demo song, longest frame | about 3700 (19 percent of a frame) |
| demo song with three effects playing over it (zap, ting, boom) | about 5500, about 6000 in the frame the three start (30 percent) |
| worst case made on purpose: speed 1, vibrato starts on all three voices in the same frame, big sweep and arpeggio | about 5300 |
| the same with `inst_release` 32 (or more) | about 8200 |
| six lanes (three music, three effects) that all start a vibrato in the same frame | about 10,000 (half a frame) |
| no song and no effect | about 150 (it still looks at the requests and the effect lanes) |

A normal frame is cheap and steady: three voices, each with a few table lookups and seven SID writes. The effect lanes added about 240 cycles to a frame without effects (the checks for them); a playing effect costs about as much as a music voice. A game with a busy interrupt should not give effects a vibrato on all voices at once. The longer frames are the ones where something starts: a vibrato (the division), a new pattern. The interrupt itself adds about 70 cycles (KERNAL entry, the acknowledge, `jmp $EA81`). There are no unbounded loops: the loops depend on the length of an order-list chain (16 at most) and on `inst_release` (32 at most).

## 9. How it was checked

- `node --test web/player/test.mjs`: 62 tests (15 of them for the effects and the slide: an effect without a song and before `music_init`, the music that is silent but keeps time and comes back at its next note, two effects at once, the effect's own speed, replacing and `sfx_stop`, `music_init` and `music_stop`, slides up and down, clamping, with vibrato, on a drum, with legato, and run time). They load `player.prg` into the JavaScript 6502 core, write tiny songs and instruments, call `music_init` and `music_play` like the interrupt does, and check the SID writes with their cycle numbers (pitch, gate, envelope, order of writes, timing of the clean end, edge cases above, state block values, loop, stop, transpose, pulse sweep, vibrato, arpeggio with two and with three notes, drum, legato, broken songs, run time). Three tests render audio with the SID emulation: two measure the pitch of notes, one checks that 24 repeated notes in each of nine envelope settings all make sound within a frame of the expected moment (it fails with the older player, which started about one note in nine two frames late). Besides these, the same probes were run without audio through the envelope code of the SID emulation, in all nine alignments of the writes (the player's `write_voice` shifted by 0 to 8 `nop`s) and on random songs: zero late starts after a clean end; before the change 1.8 percent of those starts were late, and 63 percent in the original demo song. `WAV_DIR=somewhere node --test web/player/test.mjs` also writes the demo song as a WAV file.
- In VICE (`x64sc`, the accurate emulator), with a test image made by patching other instruments and songs into `player.prg`: ten pulse notes from A-2 to A-6 and others measured within 0.3 cents of the equal-tempered pitch; 48 drum hits (kick, snare, hat, 16 each) with the same energy in every hit within a few percent, a kick whose tone falls by the expected 8.8 Hz per frame after a one-frame noise click, silence (below 20 of 32768) between hits; a vibrato that stays silent for the delay and then swings +-50 cents; the demo song, whose second round is aligned to the first one at exactly 768 frames; and a held A-3 with arpeggio offsets 4 and 7, which gives 220, 277 and 330 Hz in turn, one frame each. For the change to format 2 the SID writes of the six demo songs (3000 frames each) were compared between the old and the new player: the same registers and values in every frame. The same comparison was made again after the effect lanes and the slide were added (seven demo songs, slide 0, no effect): identical. The exported `instruments.asm`, `sfx.asm` and `song_<name>.asm` were assembled with ACME together with `music.asm` at another address (`$4000`) and the result played an effect on the right voice. The recipe: `x64sc -remotemonitor -sound -sounddev wav -soundarg out.wav -autostart some.prg`, wait, then send `quit` to the remote monitor (`nc 127.0.0.1 6510`) so that the WAV gets its header; analyse the WAV with a FFT per frame.
- Sound is still judged by ear: the numbers above say nothing about taste.

## 10. Known limits and open points

- The noise generator is not reset between hits (the TEST bit is held only for a few cycles; the chip needs a long time for that), so two hits of the same noise drum are the same in character but not sample for sample.
- Legato must follow its note directly in the same pattern; at a pattern boundary it starts a new note.
- A note shorter than 3 frames cannot have a clean end (see section 5). The next note then restarts the envelope in the same frame; if the previous note had already faded to almost nothing (a plucked sound with sustain 0) that restart can still be up to two frames late. The same goes for a rest of one frame (speed 1) after such a note. Give such notes 3 frames or more.
- Very slow attacks (13 or more: 0.7 s and up) on notes that end before the attack has taken its first step can give a short blip at full volume about 30 ms later. Use notes that are longer than the attack's first steps, or a faster attack.
- NTSC: the frequency table is PAL only, and a 60 Hz interrupt plays everything 20 percent too fast.
- There is no filter, no volume per voice and no portamento yet (see section 9 of the design document). The event bytes `$63` to `$7F` and the unused `$80` to `$FE` are reserved for them.
- Sound effects have no priorities: a new effect on a voice replaces the one that plays there. One effect drives one voice; a two-voice effect is two effects started together.
