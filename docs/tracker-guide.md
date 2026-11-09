# The tracker: user guide

The tracker is a web page. Open <https://ddecoene.github.io/WebSidTracker/>, or run it locally (see the [README](../README.md#running-the-tracker)). It plays your song with the same 6502 player code that your game will use, on an emulated SID chip, so what you hear is what the exported files do on a C64 (PAL). Edits are live: change a note or an instrument while the song plays and you hear it at once.

The sound is the part to check by ear. The numbers on screen say nothing about taste.

## 1. Concepts

**Song.** One song has a name, a speed, three voices and a set of patterns. The tracker edits one song at a time. The instruments belong to the project and are shared by all songs you export from it.

**Voice.** The SID chip has three voices. Each voice plays one note at a time. A voice can play any instrument, drums included.

**Frame, tick, speed.** The player runs once per video frame, 50.125 times a second on PAL. A *tick* is the unit of musical time: one tick is *speed* frames. Every note and rest has a length in ticks (1 to 255). The speed is one number for the whole song (1 to 255; lower is faster). The field next to it shows the tempo in beats per minute if four ticks make a beat. All three voices share one tick clock, so they never drift apart. Things like the pulse sweep and the vibrato run every frame, not only on ticks.

**Pattern.** A short list of events: notes (a pitch and a length), rests, instrument changes, and legato markers. The grid shows one row per tick. A note that lasts four ticks takes four rows, with the note on the first. Patterns are shared by all voices, and a pattern can be used many times. A song has at most 254 patterns, numbered 0 to 253.

**Order list.** Each voice has its own order list. It says which pattern the voice plays next. An entry is a pattern number plus a *transpose* in semitones (so the same bass line can be played a fourth higher). The list ends with a *stop* entry (the voice goes silent for good) or a *loop* entry (go on at entry n, usually 00). Every voice ends separately; the song is over when all three have stopped.

**Instrument.** A bundle of settings: waveform, envelope, pulse width and how it sweeps, vibrato, arpeggio, drum behaviour. Instrument numbers are shown in hex (00 to FF). A pattern selects the instrument with an instrument event; a voice starts every song on instrument 00, and an instrument stays until the pattern switches it.

**Pitch.** 96 notes, C-0 to B-7 (the octave number is the one you see in the grid, 12 notes per octave; note names use `C-`, `C#`, `D-`, ...). A pitch that is out of range after the transpose is clamped to the range.

## 2. Quick start

1. Open the page. It starts with the project you last worked on (kept in your browser) or with a demo tune. **New** starts an empty project.
2. Click the pattern grid and play notes on the computer keyboard like a piano: the row `z s x d c v g b h n j m` is the lower octave, `q 2 w 3 e r 5 t 6 y 7 u` the next one up. Each key press plays the note and enters it at the cursor.
3. `<` and `>` change the octave. `9` and `0` change the default length of new notes. `;` and `'` change how many rows the cursor moves down after entering a note.
4. Press `[` and `]` to pick another instrument, or edit the instrument on the right. The piano at the bottom of the instrument panel plays it.
5. Press **Space** to play from the start and **Space** again to stop. **Shift+Space** plays from the cursor. The **Follow** switch lets the grid scroll with the song.
6. Set the loop: in the order list, `o` moves the keyboard there; `Insert` adds an entry, `l` turns the entry into a loop to entry 00, `s` into a stop.
7. **Save** downloads the project as a JSON file; **Open** reads one. The tracker also keeps an autosave in your browser, but save to a file for anything you care about.
8. **Export** gives you the files for your game (section 6).

The header also has a SID chip switch (MOS 6581 or CSG 8580), a master volume (for listening only; the game sets its own volume), a mute button for each voice (M1, M2, M3), and a level meter. A line shows how many bytes the song and the instrument tables take and how many are left. The strip below the header lists problems that stop the song from playing or exporting (for example a loop that plays no notes).

## 3. Keys

Keys work when the pattern editor or the page has the focus, not when you are typing in a text field. Press `?` in the tracker to see the same lists in a dialog.

### Everywhere

| Key | What |
|---|---|
| Space | Play the song from the start / stop |
| Shift+Space | Play from the cursor |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y / Cmd+Shift+Z | Redo |
| Ctrl+S / Cmd+S | Save the project as a file |
| ? | Show the help |

### Pattern editor

| Key | What |
|---|---|
| `z s x d c v g b h n j m` | Play and enter a note, lower octave (C to B) |
| `q 2 w 3 e r 5 t 6 y 7 u` | Play and enter a note, one octave higher |
| `<` and `>` (or F1 / F2) | Octave down / up |
| `1` | Enter a rest |
| `9` / `0` | Default length of new notes: shorter / longer (ticks) |
| `;` and `'` | Step: rows to move down after entering: less / more |
| `-` / `=` | Make the note or rest under the cursor one tick shorter / longer |
| Delete or `.` | Clear the note under the cursor (it becomes a rest of the same length) |
| Insert / Backspace | Insert a row / delete a row (later events move) |
| Shift+Up / Shift+Down | Move the note under the cursor a semitone up / down |
| `l` | Legato marker on / off for the note under the cursor |
| `[` / `]` | Previous / next instrument |
| `i` | Type an instrument number (two hex digits) |
| Enter | Give the note under the cursor the current instrument |
| Up / Down, PageUp / PageDown | Move the cursor (1 row, 16 rows) |
| Home / End | First row / the end of the pattern |
| Left / Right, Tab / Shift+Tab | Switch voice |
| Alt+Up / Alt+Down | Previous / next entry in the order list of this voice |
| `o` | Switch between the pattern grid and the order list |
| Shift+N | New empty pattern for this order entry |
| Shift+D | Duplicate the pattern of this order entry as a new pattern |
| Shift+X | Delete the pattern of this order entry (refused while another entry uses it) |
| Mouse | Click a row or an order entry to place the cursor |

The buttons above the grid do the same as some keys: New pattern, Duplicate, Delete pattern, Insert entry, Delete entry. The pattern name field names the pattern (names are for you; they appear as comments in the export).

### Order list (after pressing `o`)

| Key | What |
|---|---|
| `+` / `-` | Next / previous pattern number (or loop target); hex digits type it |
| `[ ]` and `{ }` | Transpose of the entry: 1 semitone / 1 octave down and up |
| Insert, Backspace | Insert an entry after this one / delete this entry |
| `s`, `l`, `p` | Make the entry STOP / LOOP to entry 00 / a pattern again |
| Enter | Go to the pattern grid |

Up and Down, Home and End also move through the order list entries while it has the keyboard.

### Instrument editor

| Key | What |
|---|---|
| `z s x d c v g b h n j m` | Audition: lower octave (in the instrument panel) |
| `q 2 w 3 e r 5 t 6 y 7 u` | Audition: upper octave |
| `[ ]` | Octave down / up for auditioning |
| Up / Down (in the list) | Select the previous / next instrument |

The panel also has the mouse controls: the list with New, Duplicate and Delete, a name field, preset buttons (Bass, Lead, Pad, Pluck, Kick, Snare, Hat), a slider and number box for every field, and a small on-screen piano. Delete does not renumber the other instruments: instrument numbers stay stable, and the tracker warns when a song still uses an instrument that no longer exists.

## 4. What the instrument fields do

All of this runs on the real player, on every frame of the note (except where noted). Changing a field while a note sounds is heard at once for the per-frame features; fields that matter only when a note starts (waveform, envelope, start pulse width and the sweep step) apply from the next note.

**Waveform.** Triangle (soft, flute-like), Saw (bright, buzzy), Pulse (full, its colour depends on the pulse width), Noise (hiss, for drums and effects). Ring and Sync are the SID's ring modulation (works with triangle) and hard sync. Combining waveforms is possible; the SID mixes them in a way that often sounds thin, so check by ear.

**Envelope.** Attack is the time to rise to full volume (0 is a hard start, 2 ms; high values fade the note in). Decay is the fall from full volume to the sustain level. Sustain is the level the note rests at while it is held (0 lets the note die away by itself, 15 is full volume). The times shown are the real SID times. The release setting in this group is not heard: the player closes every note in its own way (see Release frames), and writes zero to the envelope registers then.

**Pulse width.** *Start width* is the width at the start of every note (12 bits, shown as a percentage; 50 percent is a square wave, 0 and 100 percent are silent). *Sweep step* is added to the width every frame: that movement is what makes a pulse sound fat (0 keeps it still; the value is signed, -128 to 127). *Sweep min* and *Sweep max* are the turning points, in units of 1/16 of the width range (shown as a percentage). Stay away from 0 percent. When the width reaches a limit the sweep turns around.

**Vibrato.** *Delay* is the number of frames after the start of the note before the vibrato begins (long notes get life, short notes stay clean). *Depth* is the width of the wobble in 1/16 of the way to the next semitone below (16 is a whole semitone either side; 0 switches vibrato off). It sounds equally wide in bass and treble. *Speed* is the number of frames of one swing from one side to the other (a low number is fast; 3 to 5 sounds natural; an odd number is rounded down to the even one below, and 1 counts as 2). Vibrato is not applied to drums. Changing depth while a note sounds needs a new note (0 switches it off at once).

**Arpeggio.** *Offset* in semitones. Every second frame the pitch jumps to the note plus the offset, so it flutters between two pitches at 25 Hz. 12 is an octave, 7 a fifth, 4 a major third; the fast flutter sounds like a chord. 0 is off. Not applied to drums.

**Drum.** *Noise frames* above 0 turns the instrument into a drum. The note starts with that many frames of noise at the pitch of the note. After that the waveform you chose plays from the same pitch and falls by *Fall* (in SID frequency register units per frame; a large value gives a quick boom, 0 keeps the pitch, as for a hat). Play drums on low notes for kicks and higher notes for snares and hats. The pulse sweep still works on a drum; vibrato and arpeggio do not.

**Release frames.** The last N frames of every note are used to close the gate and clear the envelope, so the envelope is empty when the next note starts and every note starts the same, without clicks. The standard is 2. It counts in frames, not ticks. The first frame of a note always sounds, so a note is never shortened below one frame. The player treats 0 as 1 and any value above 32 as 32, although the field allows up to 255.

**Legato.** Not an instrument field, but a pattern one: with the legato marker on a note (`l`), the note after it only changes pitch and does not restart the envelope, the pulse sweep or the vibrato. It must be in the same pattern and directly after the note. If nothing sounds at that moment the next note is an ordinary new note.

## 5. Limits

| What | Limit |
|---|---|
| speed | 1 to 255 frames per tick |
| note or rest length | 1 to 255 ticks |
| pitch | 0 to 95 (C-0 to B-7) |
| patterns per song | 254 (numbers 0 to 253) |
| instruments | 256 |
| transpose | -96 to 96 semitones in the tracker |
| song size | it must end below `$C000`; the header line shows the space left |
| one pattern | the player reads a pattern with a one-byte position, so a pattern can be at most 255 bytes including its end marker (the tracker does not check this yet, so keep patterns short) |
| order list | the player can address 128 entries per voice (stop and loop entries included); the tracker's check allows more, so keep your lists below 128 |

A song that breaks a limit the tracker checks is flagged in the strip below the header and cannot be exported.

## 6. Export, and using the files in a game

**Export** shows three files, each with a Download button (and a Show and Copy button for the text files):

| File | What |
|---|---|
| `instruments.asm` | the instrument tables, one table per field, shared by all your songs. Only as many entries as your highest used instrument needs |
| `song_<name>.asm` | the song, with the label `song_<name>` at its header. `<name>` is the song name made safe for a label |
| `<name>.prg` | a ready-to-run program (BASIC line, player, instruments, your song). Load it on a C64 or in VICE and RUN it |

The files are ACME assembler source. The player itself, `music.asm`, does not change per song: copy it from `src/music.asm` in this repository. All three files are MIT licensed, the player is MIT, and so is the `.prg`.

Put the files in your game project and include them:

```
        !source "music.asm"            ; the player (no * = line: it lands wherever you include it)
        !source "instruments.asm"
        !source "song_title.asm"
```

Then two calls start the music and keep it going. `music_play` must be called once per frame, from your raster interrupt:

```
start   ...
        sei
        lda #<song_title        ; address of the song header
        ldx #>song_title
        jsr music_init          ; starts the song, sets the SID volume to 15
        ; ... set up the raster interrupt as usual ...
        cli

irq     lda #$01
        sta $D019               ; acknowledge the raster interrupt
        jsr music_play          ; once per frame: all SID writes happen here
        ; ... the rest of your interrupt ...
        jmp $EA81

stop_music
        jsr music_stop          ; silence all voices and stop
        rts
```

Notes:

- `music_init` takes the low byte of the header address in A and the high byte in X. It clobbers A, X and Y. Calling it again starts another song at once. The player has no song table: you pick a song with its label.
- `music_play` clobbers A, X and Y. It clears the decimal flag, so it is safe from an interrupt that did not. When all three voices have stopped it returns at once, in 12 cycles.
- The player is PAL: one `music_play` per 50 Hz frame. On NTSC (60 Hz) everything would play about 20 percent too fast, and the pitches are for the PAL clock. NTSC support is still to do.
- Time: a normal frame takes about 1600 cycles of the 19,656 in a PAL frame; the longest frames in the demo song take about 3300. The worst case made on purpose is about 4900 (7900 with the longest release). See [player.md](player.md), section 8.
- The player writes only to the SID (`$D400` to `$D418`), 14 bytes of zero page from `$E0` (move them by defining `zp_music` before you include `music.asm`), the stack (at most 10 bytes), and its own memory (about 1.5 KB).
- The game owns the SID volume after `music_init` (it sets 15); `music_stop` writes 0 to every SID register, volume included.

All the details (what happens in odd cases, the state block, the limits) are in [player.md](player.md).

## 7. Memory map

In the tracker and in the exported `.prg`:

| Range | Content |
|---|---|
| `$0801-$0FFF` | the BASIC line `10 SYS 2064` and the small program that sets up the raster interrupt (line 250) |
| `$1000-$1FFF` | the player: code, frequency table, state block (about 1.5 KB) |
| `$2000-$2EFF` | the 15 instrument tables of 256 bytes, in this order: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release` |
| `$3000-$BFFF` | the song (header at `$3000`); it must end below `$C000` |
| `$C000-` | in the tracker only: a scratch song for playing single notes while you audition |
| `$E0-$ED` | zero page used by the player |

In your own game the addresses are your own: `music.asm` has no fixed address, and the tables of `instruments.asm` and the song can be anywhere. Only the `.prg` uses the map above.
