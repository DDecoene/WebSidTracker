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

1. Open the page. It starts with the project you last worked on (kept in your browser) or, the first time, with the Ode to Joy demo. **New** starts an empty project.
2. Click the pattern grid and play notes on the computer keyboard like a piano: the row `z s x d c v g b h n j m` is the lower octave, `q 2 w 3 e r 5 t 6 y 7 u` the next one up. Each key press plays the note and enters it at the cursor.
3. `<` and `>` change the octave. `9` and `0` change the default length of new notes. `;` and `'` change how many rows the cursor moves down after entering a note.
4. Press `[` and `]` (or use the Instrument selector in the bar above the grid) to pick the instrument that new notes get, or edit the instrument on the right. The piano at the bottom of the instrument panel plays it. To change the instrument of a note that is already there, click its chip in the grid.
5. Press **Space** to play from the start and **Space** again to stop. **Shift+Space** plays from the cursor. The **Follow** switch lets the grid scroll with the song.
6. Set the loop: each voice has an order list above its grid. `ins` (or `Insert` after pressing `o`) adds an entry; choose LOOP in the entry's drop-down (or press `l`) to loop to entry 00, and STOP (or `s`) to end the voice. Change the pattern of an entry with its drop-down, and its transpose with the number box, the plus and minus buttons or the -12 and +12 buttons.
7. **Save** downloads the project as a JSON file; **Open** reads one. The tracker also keeps an autosave in your browser, but save to a file for anything you care about.
8. **Export** gives you the files for your game (section 6).

The header has a **Demos** menu with six songs to listen to and learn from: Ode to Joy, Für Elise, Rondo alla Turca, Toccata in D minor, In the Hall of the Mountain King, and the Original demo tune. A first visit starts with Ode to Joy, so Play gives you something to hear at once. Choosing a demo stops the playback and replaces the current project; if you have unsaved changes the tracker first asks whether to discard them. Hover an entry to read what is in it.

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
| < and >  (or F1 / F2) | Octave down / up |
| `1` | Enter a rest |
| `9 / 0` | Default length of new notes: shorter / longer (ticks) |
| ;  and  ' | Step: rows to move down after entering: less / more |
| `- / =` | Make the note or rest under the cursor one tick shorter / longer |
| Delete or . | Clear the note under the cursor (it becomes a rest of the same length) |
| Insert / Backspace | Insert a row / delete a row (later events move) |
| Shift+Up / Shift+Down | Move the note under the cursor a semitone up / down |
| `l` | Legato marker on / off for the note under the cursor |
| `[ / ]` | Previous / next current instrument (the one new notes get) |
| `i` | Type a current instrument number (two hex digits) |
| Enter | Give the note under the cursor the current instrument |
| Shift+Enter | Give the note under the cursor and all notes after it in the pattern the current instrument |
| Shift+I | Open the instrument list for the note under the cursor (the same as clicking its instrument) |
| Up / Down, PageUp / PageDown | Move the cursor (1 row, 16 rows) |
| Home / End | First row / the end of the pattern |
| Left / Right, Tab / Shift+Tab | Switch voice (in the order list Left / Right move between the fields first) |
| Alt+Up / Alt+Down | Previous / next entry in the order list of this voice |
| Alt+Shift+Up / Alt+Shift+Down | Move the order entry up / down in its list |
| `o` | Switch between the pattern grid and the order list |
| Shift+N | New empty pattern, put in this order entry |
| Shift+D | Duplicate the pattern of this order entry as a new pattern, put in this entry |
| Shift+X | Delete the pattern of this order entry (refused while another entry uses it) |
| Shift+P | Go to the Patterns list |
| Mouse | Click a grid row to place the cursor, an instrument chip to change that note's instrument; use the controls on every order entry; click a pattern to select it, double-click to use it, drag it onto an order entry or between two entries |

The Patterns panel on the left holds the buttons New, Delete unused, Use in entry, Add entry, Duplicate, Rename and Delete (see section 4). Click an instrument chip in the grid to change that note's instrument. The Instrument selector in the bar above the grid chooses the current instrument; To note and To rest of pattern apply it.

### Order list (after pressing `o`)

| Key | What |
|---|---|
| Left / Right | Move between the fields of the entry: pattern, transpose (or loop target); at the edge go to the next voice |
| Up / Down | Change the field: next / previous pattern, transpose 1 semitone up / down, loop target |
| Shift+Up / Shift+Down | On the transpose field: one octave (12 semitones) up / down |
| `0-9, a-f` | Type the pattern number (or the loop target) in hex |
| PageUp, PageDown, Home, End | Previous / next entry, first / last entry |
| `+ / -` | Next / previous pattern number (or loop target), as Up / Down |
| [ ] and { } | Transpose of the entry: 1 semitone / 1 octave down and up (as Shift+Up / Down, kept from earlier versions) |
| Insert, Backspace | Insert an entry after this one / delete this entry |
| `s, l, p` | Make the entry STOP / LOOP to entry 00 / a pattern again |
| Enter | Go to the pattern grid |

### Patterns list (after Shift+P)

| Key | What |
|---|---|
| Up / Down | Select the previous / next pattern (Home and End jump) |
| Enter | Use the selected pattern in the current order entry |
| Shift+Enter or Insert | Insert the selected pattern as a new order entry after the current one |
| F2, Delete, Escape | Rename it / delete it (only when unused) / back to the editor |

### Instrument editor

| Key | What |
|---|---|
| `z s x d c v g b h n j m` | Audition: lower octave (in the instrument panel) |
| `q 2 w 3 e r 5 t 6 y 7 u` | Audition: upper octave |
| `[ ]` | Octave down / up for auditioning |
| Up / Down (in the list) | Select the previous / next instrument |

The panel also has the mouse controls: the list with New, Duplicate and Delete, a name field, preset buttons (Bass, Lead, Pad, Pluck, Kick, Snare, Hat), a slider and number box for every field, and a small on-screen piano. Delete does not renumber the other instruments: instrument numbers stay stable, and the tracker warns when a song still uses an instrument that no longer exists.

### Managing patterns

The Patterns panel on the left lists every pattern with its name, size (ticks, notes, bytes) and the voices that use it (a chip such as V1 x2: voice 1, two entries; click it to go to the entry). A pattern that no order entry uses has an *unused* badge, and the header counts them.

- **See what is unused.** Look for the badge, or tick "unused only" to list just those patterns.
- **Reuse a pattern in another voice or position.** Select it and press Use in entry (it replaces the pattern of the current order entry) or Add entry (a new entry after the current one). You can also drag its number onto an order entry, or between two entries. Then set that entry's transpose: the same pattern then plays higher or lower, and it exists only once.
- **Duplicate and vary.** Select a pattern and press Duplicate. The copy is a new, unused pattern; put it in an entry with Use in entry, change it, and give it a name with Rename. The original stays as it was.
- **Delete unused.** Delete removes the selected pattern, but not while an entry uses it (the message names the entries). Delete unused removes all unused patterns at once and asks you to press it a second time. The remaining patterns are renumbered and the order entries follow, so the music does not change.

### Changing the instrument of a note

In the grid every note shows an instrument chip. A bright chip means the instrument is set at that note; a dim chip is inherited from an earlier note or pattern.

- **With the mouse.** Click the chip of the note, then click an instrument in the list that opens. Tick "also the rest of the pattern" in the list to change all later notes in the pattern as well.
- **With the keyboard.** Choose the current instrument (`[` and `]`, `i`, or the Instrument selector) and press Enter on the note (the To note button), or Shift+Enter (To rest of pattern) to change this note and every note after it in the pattern. Shift+I opens the same list as a click on the chip.

## 4. What the instrument fields do

All of this runs on the real player, on every frame of the note (except where noted). Changing a field while a note sounds is heard at once for the per-frame features; fields that matter only when a note starts (waveform, envelope, start pulse width and the sweep step) apply from the next note.

**Waveform.** Triangle (soft, flute-like), Saw (bright, buzzy), Pulse (full, its colour depends on the pulse width), Noise (hiss, for drums and effects). Ring and Sync are the SID's ring modulation (works with triangle) and hard sync. Combining waveforms is possible; the SID mixes them in a way that often sounds thin, so check by ear.

**Envelope.** Attack is the time to rise to full volume (0 is a hard start, 2 ms; high values fade the note in). Decay is the fall from full volume to the sustain level. Sustain is the level the note rests at while it is held (0 lets the note die away by itself, 15 is full volume). The times shown are the real SID times. There is no Release setting: the player closes every note in its own way (see Release frames) and writes zero to the envelope registers then, so a release value would never be heard. The editor shows it as not used, and warns if an instrument still has one (an old file, for example); you can set it to 0 with one click.

**Pulse width.** *Start width* is the width at the start of every note (12 bits, shown as a percentage; 50 percent is a square wave, 0 and 100 percent are silent). *Sweep step* is added to the width every frame: that movement is what makes a pulse sound fat (0 keeps it still; the value is signed, -128 to 127). *Sweep min* and *Sweep max* are the turning points, in units of 1/16 of the width range (shown as a percentage). Stay away from 0 percent. When the width reaches a limit the sweep turns around.

**Vibrato.** *Delay* is the number of frames after the start of the note before the vibrato begins (long notes get life, short notes stay clean). *Depth* is the width of the wobble in 1/16 of the way to the next semitone below (16 is a whole semitone either side; 0 switches vibrato off). It sounds equally wide in bass and treble. *Speed* is the number of frames of one swing from one side to the other (a low number is fast; 3 to 5 sounds natural; an odd number is rounded down to the even one below, and 1 counts as 2). Vibrato is not applied to drums. Changing depth while a note sounds needs a new note (0 switches it off at once).

**Arpeggio.** *Offset* in semitones. Every second frame the pitch jumps to the note plus the offset, so it flutters between two pitches at 25 Hz. 12 is an octave, 7 a fifth, 4 a major third; the fast flutter sounds like a chord. 0 is off. Not applied to drums.

**Drum.** *Noise frames* above 0 turns the instrument into a drum. The note starts with that many frames of noise at the pitch of the note. After that the waveform you chose plays from the same pitch and falls by *Fall* (in SID frequency register units per frame; a large value gives a quick boom, 0 keeps the pitch, as for a hat). Play drums on low notes for kicks and higher notes for snares and hats. The pulse sweep still works on a drum; vibrato and arpeggio do not.

**Release frames.** The last N frames of every note are used to close the gate and clear the envelope, so the envelope is empty when the next note starts and every note starts the same, without clicks. The standard is 2. It counts in frames, not ticks. The first frame of a note always sounds, so a note is never shortened below one frame. The SID needs almost two frames (33 ms) before a closed gate really starts to release when the envelope has a decay above 0, and a note that opens its gate before that is up to two frames late. So with a decay above 0 the player plays 0 and 1 as 2, and a note of 1 or 2 frames keeps its gate open instead (the next note restarts it). With decay 0 one frame is enough (0 is played as 1). Any value above 32 is played as 32, although the field allows up to 255. Notes of 3 frames or more always start exactly on their tick; for shorter notes (speed 1 or 2) a plucked sound with sustain 0 can start a little late.

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

### Older project files

Every project file says which format it has and which release wrote it. When you open a file (or the browser's own saved project) that is older than the tracker, the tracker does not change anything yet. It shows a dialog with the two formats and a list of what porting would lose or change ("Nothing is lost" if nothing), and you choose:

- **Port to this version.** The result opens as an unsaved project; the file on disk is not changed, Save makes a new one.
- **Open in the old tracker.** The tracker opens the newest release that has the file's format, with your file loaded. Your current project is saved in the browser first.
- **Cancel.**

If porting is not possible (the result would not be a valid project) the dialog says why and only the old tracker is offered. If the list of releases cannot be loaded, only porting is offered. A file from a newer tracker is refused with a message; open it in a newer release. In a release that is older than the project saved in the browser, autosave stays off so that project is not overwritten; use Save.

## 6. Export, and using the files in a game

**Export** shows three files, each with a Download button (and a Show and Copy button for the text files). The second line of each assembler file names the format and the release that wrote it:

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
- Time: a normal frame takes about 1600 cycles of the 19,656 in a PAL frame; the longest frames in the demo song take about 3300. The worst case made on purpose is about 5000 (8000 with the longest release). See [player.md](player.md), section 8.
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
