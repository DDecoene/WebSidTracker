# Concept: a Hubbard-inspired music player and tracker for the C64

Status: concept, nothing built yet. This is the starting document of WebSidTracker.

## 1. Why this document exists

We want a tracker (a web app) and a small music player that anyone can drop into their own C64 game, together with the song and instrument data the tracker makes.

Rob Hubbard's players are the sound we are after. His player code is his copyrighted work, and copying it, or building a thin copy of it, is not acceptable for a public project. So this document does one thing: it describes **what made his approach special and which ideas a player of this kind contains**, as ideas. A new player has to be designed from these ideas, with its own data format and its own internal structure.

Rules for the new project that follow from this:

- No code, labels, variable layout, table order or byte formats from any of his players are used. No disassembly of his work belongs in this repository, not even as a reference file.
- The new player does not have to play Hubbard's data. Compatibility with his format is not a goal. The same *feel* is.
- Everything below is written from understanding and memory. Where a claim about history is uncertain it says so.

## 2. Who Rob Hubbard was and what his breakthrough was

Rob Hubbard (born 1955, English) wrote music for C64 games in the mid-1980s: *Monty on the Run*, *Commando*, *Crazy Comets*, *Thing on a Spring*, *Sanxion*, *Delta*, *International Karate* and many more. (Dates and titles are from memory and should be checked before they go in a README.)

His breakthrough was not a new chip trick but a new attitude: **the SID is an instrument you play every frame, not a chip you set once per note.** Before him, C64 game music was mostly a sequence of notes with a fixed waveform and an envelope, each note written to the chip once. Hubbard's players ran every 50th of a second and changed the sound *while the note was sounding*. The result is that three voices sound like a band:

- **Movement inside a note.** The pulse width of the square wave sweeps while the note plays, so a note does not stay a flat buzz but breathes. This is the "fat" Hubbard sound.
- **Vibrato** that starts after the note has begun, the way a player's hand does, and not as a constant wobble.
- **Arpeggios**: one voice cycles fast through the notes of a chord, so a single voice suggests a chord.
- **Drums on a melodic voice**: a drum is a short noise burst followed by a tone whose pitch falls quickly. It costs nothing but a few bytes and one voice for a moment.
- **Slides and sound effects** that share the same machinery as the music.
- **Compact songs.** Songs are built from short patterns that are reused, and from a list that says which pattern comes when. A song of several minutes fits in a few hundred bytes. This is also why the *music* of a game could stay small while the *sound* felt big.

The craft is in the combination: a small set of cheap per-frame effects, selected per instrument, driven by compact song data.

## 3. What is inside such a player (ideas, not code)

### 3.1 The heartbeat

- One routine, called once per frame from the raster interrupt (50 Hz on PAL). Everything happens in this call.
- A **tick** is a number of frames. A song has its own speed, so slow and fast songs share one player.
- A note has a length measured in ticks. A new note starts only on a tick boundary; between ticks, the per-frame effects run.

### 3.2 Three voices, each with its own stream

- Each voice reads its own list of patterns. A pattern is a stream of notes, each with a length, an optional instrument change and a pitch.
- A pattern ends with an end marker; the list of patterns ends with "loop" or "stop".
- Patterns are shared: the same pattern can be used on any voice and any number of times.
- A rest is a note with no pitch.

### 3.3 Instruments

An instrument is a small record of parameters, picked per note:

- the waveform (triangle, saw, pulse, noise) and the envelope (attack, decay, sustain, release),
- the starting pulse width and how fast it sweeps,
- the vibrato depth,
- a few switches for special effects (drum, arpeggio, jitter, and so on).

The musical character of a song is mostly in its instruments.

### 3.4 Per-frame effects

- **Pulse width sweep:** a value added to the pulse width every frame, bouncing between two limits.
- **Vibrato:** the pitch moves a fraction of the distance to the neighbouring semitone, back and forth, with a depth per instrument. Because it is a fraction of the *distance to the next note*, the vibrato sounds equally wide in the bass and in the treble.
- **Arpeggio / octave jump:** the pitch alternates between the note and a second pitch each frame.
- **Drum:** noise for one frame, then a waveform whose pitch drops each frame.
- **Slides** for sound effects.

### 3.5 Gate handling

The player switches a note off shortly before the end of its length, so the release can be heard and the next attack starts clean. Notes can be marked to skip this (legato). This is a large part of why repeated notes sound separate and crisp.

### 3.6 Sound effects on the same voices

A sound effect borrows a voice from the music for a moment and gives it back afterwards. The data for an effect is a small record with start values and a slide. One routine handles both music and effects.

### 3.7 What the player does *not* have

- No filter work (as far as we saw, the volume register is the only global one).
- No complex editor-style features: no tables per instrument, no portamento commands, no per-note effect columns. Everything is a flag or a number in the instrument.

These gaps are where a new player can do better.

## 4. What a new player should keep, and where it may differ

Keep, because it is the sound:

1. Per-frame modulation as the core idea.
2. Short reusable patterns and a pattern list per voice.
3. Instruments as parameter records, with drum, arpeggio, vibrato and pulse sweep.
4. A small, readable routine that fits in about 1 to 2 KB.

Free to design differently, in our own way:

- the data format (we choose it, and the tracker writes it),
- the tick and timing model,
- how instruments reference effects (for example a short per-instrument table of steps instead of a bit field),
- whether to add filter control, portamento, a "hard restart" before each note, and a volume per voice.

A different format also protects us: if the bytes differ and the structure is our own, nobody can say we copied.

## 5. The tracker (web app)

- Runs in the browser, static site, no server (for example GitHub Pages). Songs can be saved in the browser and as a file.
- A grid with three columns (one per voice) and one row per tick, with notes, lengths and instruments.
- A pattern list per voice, an instrument editor for the parameters in 3.3, and a speed setting.
- **Live playback** that sounds like the real player. This means the tracker contains the same player logic (a reimplementation in the browser, or the 6502 player running in an emulator) and a SID emulation (for example reSID compiled to WebAssembly, or a JavaScript SID).
- Export: assembler source with the song and instruments (to drop into a game next to the player), a ready-to-run `.prg`, and perhaps a `.sid` file.

## 6. Distribution and licensing

- The player and tracker are original work and can carry an open licence chosen by the author.
- Any song a user makes belongs to the user.
- We do not ship Hubbard's code, data or songs. Examples must be our own music.
- Keep this repository free of third-party player code and songs at all times.

## 7. Open questions for the next step

1. Live playback: reimplement the player in JavaScript, or run the real 6502 player in an emulator inside the page?
2. Which SID emulation to use, and how to make it sound like the real chip (reSID-fast sounded worse than VICE's accurate mode in our tests).
3. The first version of the data format: how big, how simple, how extendable.
4. A short list of target effects to sound "Hubbard enough", checked by ear against a few reference tunes the author chooses.
5. Name and licence of the new project.
