// manual.js - the manual of the tracker, as data.
//
// One source feeds the standalone page (manual.html) and the Help dialog in the tracker.
// manual-render.js documents the block types and the inline markup. The key tables of section 8
// are not written here: they come from the key lists the editor and the instrument panel
// export themselves, so they cannot go out of date (see loadKeySources).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/** Keys the app itself handles (main.js). */
export const APP_KEYS = [
  ['Space', 'Play the song from the start / stop'],
  ['Shift+Space', 'Play from the cursor'],
  ['Ctrl+Z / Cmd+Z', 'Undo'],
  ['Ctrl+Shift+Z / Ctrl+Y / Cmd+Shift+Z', 'Redo'],
  ['Ctrl+S / Cmd+S', 'Save the project as a file'],
  ['?', 'Open the manual'],
  ['Esc', 'Close a dialog, such as the manual or the export'],
];

/**
 * The key lists that other modules provide: { app, editor, instrument }, each [[keys, text]].
 * The two UI modules are loaded on demand, so a page that never shows the key tables does not
 * pay for them; if one fails to load its list is empty and the rest of the manual still works.
 */
export async function loadKeySources() {
  const sources = { app: APP_KEYS, editor: [], instrument: [] };
  try { sources.editor = (await import('../ui/editor-logic.js')).keyHelp(); } catch (error) { console.error(error); }
  try { sources.instrument = (await import('../ui/instruments.js')).instrumentKeyHelp(); } catch (error) { console.error(error); }
  return sources;
}

export const SECTIONS = [
  // ---------------------------------------------------------------------------------------
  {
    id: 'quick-start',
    title: 'Quick start',
    blocks: [
      { type: 'p', text: 'WebSidTracker is a music editor for the sound chip of the Commodore 64, the SID. You write a song in a grid, you hear it at once, and you export it for your own C64 program. What you hear in the browser is made by the same small player program that runs on a real C64, driving an emulated SID chip, so it sounds like your game will (PAL timing).' },
      { type: 'ol', items: [
        '**Open the tracker.** The first time it starts with the demo song Ode to Joy; afterwards it starts with the project you worked on last. Sound starts at your first click or key press, because browsers do not allow it earlier.',
        '**Press Play** (or [[Space]]). The three voices play. Press [[Space]] again, or Stop, to stop. The Demos menu in the top bar has five more songs to listen to and to take apart.',
        '**Change a note while it plays.** Click a note in the pattern grid, then press a letter key such as [[z]] or [[q]]: the keys of your computer keyboard are a piano. The note under the cursor is replaced, and you hear it the next time the song gets there. Edit an instrument on the right in the same way: moving a slider is heard at once.',
        '**Save your work.** Save downloads the project as a JSON file. The tracker also keeps an automatic copy in your browser, but a file is the copy you can trust.',
        '**Export it.** Export gives you assembler files and a ready-to-run program (.prg) that you can load in the VICE emulator or on a real C64.',
      ] },
      { type: 'tip', text: 'Press [[?]] at any time to open this manual inside the tracker. Section 4 explains every key you need to enter music.' },
      { type: 'p', text: 'New to trackers? Read section 3 (Concepts) first: it is short and explains the three ideas everything rests on, the tick, the pattern and the order list. Already a C64 developer? Section 7 shows how to play the exported music from your own interrupt, and section 5 lists exactly what each instrument field does in the player.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'screen',
    title: 'The screen',
    blocks: [
      { type: 'p', text: 'The top bar has two rows. The first row is about the project, the second about listening. Under it come the pattern editor on the left and the instrument panel on the right (on a narrow screen they stand under each other).' },
      { type: 'h', text: 'Top bar, first row' },
      { type: 'table', head: ['Control', 'What it does'], rows: [
        ['**Song**', 'The name of the song. It also names the files you save and export (`my_song.json`, `song_my_song.asm`, `my_song.prg`: letters and digits only, the rest becomes an underscore).'],
        ['**New**', 'Starts an empty project. If you have unsaved changes it asks first.'],
        ['**Open**', 'Opens a project file (JSON) that Save made. If the file is damaged, the current project stays as it is and a message tells you why.'],
        ['**Save**', 'Downloads the project as a JSON file ([[Ctrl]]+[[S]] or [[Cmd]]+[[S]] does the same).'],
        ['**Export**', 'Shows the files for your game: assembler source and a .prg. See section 7. It refuses while the project has problems.'],
        ['**Demos**', 'A menu with six songs: Ode to Joy, Für Elise, Rondo alla Turca, Toccata in D minor, In the Hall of the Mountain King and an original tune. Choosing one replaces the current project; with unsaved changes it asks first. Hover an entry to read what is in it.'],
        ['**Undo / Redo**', 'Step back and forward through your edits (the last 200). The tooltip names the edit. Loading a project, New or a demo clears the history.'],
        ['**Help**', 'Opens this manual in a dialog.'],
      ] },
      { type: 'h', text: 'Top bar, second row' },
      { type: 'table', head: ['Control', 'What it does'], rows: [
        ['**Play**', 'Plays the song from the beginning.'],
        ['**From cursor**', 'Plays from the row where the cursor is, in all three voices.'],
        ['**Stop**', 'Stops and silences the chip. It is greyed out when nothing plays.'],
        ['**Speed**', 'Frames per tick, 1 to 255; lower is faster. The text next to it is the tempo in beats per minute, if four ticks make a beat. See section 3.'],
        ['**Chip**', 'Which SID chip is emulated: the MOS 6581 or the later CSG 8580. They sound a little different. It only changes what you hear in the tracker; the exported files are the same.'],
        ['**Vol**', 'Master volume for listening. It does not end up in the export (the game sets the SID volume).'],
        ['**M1 M2 M3**', 'Mute voice 1, 2 or 3 while you listen, to hear one voice alone or without one. Again, only for listening.'],
        ['**Meter**', 'The level of the sound that comes out.'],
        ['**Size readout**', 'Song: the bytes your song takes. Instruments: the bytes of the instrument tables as exported. Free: what is left of the memory for songs, in KB. It turns to a warning colour when less than 1000 bytes are left.'],
      ] },
      { type: 'p', text: 'Under the top bar a strip shows messages: a loaded demo, a failed Open, or a list of problems when the project breaks a limit (for example a pattern that is too long). While there are problems, playback keeps the last good version and Export is refused.' },
      { type: 'h', text: 'The pattern editor' },
      { type: 'p', text: 'The first line tells you where the cursor is: voice, order entry, pattern, row, and the settings for the next note you enter (octave, instrument, length, step). **Follow** makes the grid scroll along with the playing song. The buttons are New pattern, Duplicate, Delete pattern, Insert entry and Delete entry; the Pattern name field names the pattern (names are for you and show up as comments in the export).' },
      { type: 'p', text: 'Then come the **order lists**, one for each voice, with a drag handle under them to show more or fewer rows. Each row is `entry number`, `pattern number`, `transpose`, or STOP, or LOOP followed by an entry number.' },
      { type: 'p', text: 'Below that is the **pattern grid**: one column for each voice, one row for each tick, with the row number in hex at the left. A row with a note shows its name (such as `C-4`) and the instrument number; a `|` is the note still sounding, `---` is a rest. The cell with the cursor is highlighted, and the rows that are playing are tinted.' },
      { type: 'h', text: 'The instrument panel' },
      { type: 'p', text: 'A list of your instruments (number in hex, name) with New, Duplicate and Delete; a name field; preset buttons (Bass, Lead, Pad, Pluck, Kick, Snare, Hat); then the fields in groups (Waveform, Envelope, Pulse width, Vibrato, Arpeggio, Drum, Release frames), each with a short hint; and at the bottom an on-screen piano to audition the sound. Section 5 explains the fields.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'concepts',
    title: 'Concepts',
    blocks: [
      { type: 'p', text: 'A SID song is not a recording. It is a few hundred bytes of notes that a small program reads fifty times a second, and every time it reads them it also tweaks the sound chip. These are the parts.' },
      { type: 'h', text: 'Song, voices and instruments' },
      { type: 'p', text: 'A **song** has a name, a speed, three voices and a set of patterns. The SID chip has three **voices**; each plays one note at a time, and each can use any instrument, drums included. An **instrument** is a bundle of settings: waveform, envelope, pulse width and how it sweeps, vibrato, arpeggio and drum behaviour. Instruments belong to the project and are shared by all songs you export from it. Their numbers are shown in hex (00 to FF), so there can be 256.' },
      { type: 'h', text: 'Speed and ticks' },
      { type: 'p', text: 'The player runs once per video frame: 50.125 times a second on a PAL machine. That is the **frame**. Musical time is counted in **ticks**, and one tick is *speed* frames. At speed 6 a tick is 6 frames, about 120 ms; at speed 1 every frame is a tick. There is one speed for the whole song, so the three voices can never drift apart. The tempo next to the speed field assumes four ticks to a beat: speed 6 gives about 125 beats per minute. Effects like the pulse sweep and the vibrato run on every frame, not only on ticks, so they stay smooth at any speed.' },
      { type: 'h', text: 'Notes, rests and legato' },
      { type: 'p', text: 'A **note** is a pitch (C-0 to B-7, 96 notes; names look like `C-4` and `F#3`) and a **length** in ticks, 1 to 255. A **rest** is silence with a length. The grid shows one row per tick, so a note of 4 ticks takes 4 rows with the name on the first. Notes carry no volume: loudness comes from the instrument.' },
      { type: 'p', text: 'A **legato** marker on a note means that the next note, if it follows directly in the same pattern, only changes pitch: the envelope, the pulse sweep and the vibrato are not restarted. It is how you slide smoothly from one note into another.' },
      { type: 'h', text: 'Patterns and order lists' },
      { type: 'p', text: 'A **pattern** is a short list of events: notes, rests, instrument changes and legato markers. Patterns are not tied to a voice: any voice can play any pattern, and one pattern can be played many times. A song has at most 254 of them.' },
      { type: 'p', text: 'Each voice has its own **order list**, which says which pattern the voice plays next. An entry is a pattern number plus a **transpose** in semitones, so the same bass line can be played a fourth higher by writing `+05`. The list ends with a **STOP** entry (the voice falls silent for good) or a **LOOP** entry (carry on at entry n, normally 00). The voices end separately, and the song is over when all three have stopped.' },
      { type: 'h', text: 'A small worked example' },
      { type: 'p', text: 'Speed 6, voice 1. Pattern 00 holds three notes: C-4 for 2 ticks, E-4 for 2 ticks and G-4 for 4 ticks. In the grid that is eight rows:' },
      { type: 'table', head: ['Row', 'Grid', 'Event'], rows: [
        ['00', '`C-4`', 'note C-4, length 2'],
        ['01', '`|`', 'the same note still sounding'],
        ['02', '`E-4`', 'note E-4, length 2'],
        ['03', '`|`', ''],
        ['04', '`G-4`', 'note G-4, length 4'],
        ['05 to 07', '`|`', ''],
      ] },
      { type: 'p', text: 'The order list of voice 1 is:' },
      { type: 'table', head: ['Entry', 'Shown as', 'Meaning'], rows: [
        ['00', '`00 +00`', 'play pattern 00 as it is: C E G'],
        ['01', '`00 +05`', 'play pattern 00 five semitones higher: F A C'],
        ['02', '`LOOP 00`', 'go back to entry 00 and do it all again'],
      ] },
      { type: 'p', text: 'Eight ticks of 120 ms make one pass of about a second. The voice plays C E G, then F A C, and keeps repeating. Voices 2 and 3 have their own order lists, so you can start them later or stop them earlier.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'entering',
    title: 'Entering music',
    blocks: [
      { type: 'p', text: 'The note and editing keys work while the pattern editor has the focus, so click the pattern grid first. They do nothing while you type in a text field. Section 8 lists every key; this section explains how they fit together.' },
      { type: 'h', text: 'The computer keyboard as a piano' },
      { type: 'piano', lower: 'zsxdcvgbhnjm', upper: 'q2w3er5t6y7u' },
      { type: 'p', text: 'The bottom letter row is one octave from C to B, with the black keys on the row above it; the next two rows give the octave above. The **octave** is shown in the first line of the editor (the starting value is 3, so [[z]] gives `C-3` and [[q]] gives `C-4`). [[<]] and [[>]] (or [[F1]] and [[F2]]) move it down and up, from 0 to 7. Every note key plays the sound and puts the note in the pattern at the cursor, replacing what was there.' },
      { type: 'tip', text: 'While a song is playing, a note key edits the pattern but does not play the note, because there is only one player and it is busy with the song. Stop the song to hear the notes as you enter them.' },
      { type: 'h', text: 'Lengths, steps and rests' },
      { type: 'ul', items: [
        '[[9]] and [[0]] make the **default length** of new notes shorter and longer (in ticks, 1 to 255). With length 2, every note you enter lasts two rows.',
        'After a note the cursor moves down by the **step**: [[;]] makes it smaller, [[\']] larger (0 to 64). Set the step equal to the length and the cursor lands on the start of the next note every time.',
        'To change a note that is already there, put the cursor on it and press [[=]] (one tick longer) or [[-]] (one tick shorter). A shorter note leaves a rest behind so that later notes keep their place; a longer one first uses up the rest behind it.',
        'Press [[1]] to enter a rest of the default length. [[Delete]] or [[.]] turns the note under the cursor into a rest of the same length.',
        '[[Insert]] adds one row (a tick of rest) at the cursor and moves everything after it down; [[Backspace]] removes a row and moves everything up. Neither changes the notes themselves.',
        '[[Shift]]+[[Up]] and [[Shift]]+[[Down]] move the note under the cursor a semitone up or down.',
      ] },
      { type: 'h', text: 'Instruments in a pattern' },
      { type: 'p', text: '`[` and `]` pick the previous and next instrument; [[i]] followed by two hex digits picks one by number. The chosen instrument is shown in the first line. New notes are played with it, and the editor writes an instrument change into the pattern when the instrument is not the one already in force. It then shows as a number next to the note. To change an existing note, put the cursor on it and press [[Enter]], which gives it the current instrument.' },
      { type: 'p', text: 'A voice starts every song on instrument 00, and an instrument stays in force until a pattern changes it.' },
      { type: 'h', text: 'Legato' },
      { type: 'p', text: 'Press [[l]] on a note to turn its legato marker on or off. The note after it then only changes pitch. The marker only works when the next note follows directly in the same pattern; across a pattern boundary, or after a rest, the next note starts normally.' },
      { type: 'h', text: 'Patterns' },
      { type: 'ul', items: [
        '[[Shift]]+[[N]] makes a new empty pattern and points the current order entry at it.',
        '[[Shift]]+[[D]] **duplicates** the pattern of the current entry into a new pattern and points the entry at the copy: the way to make a variation without touching the original. There is no copy and paste of single rows yet.',
        '[[Shift]]+[[X]] deletes the pattern of the current entry. It is refused while another entry still uses it.',
        'A pattern can take at most 255 bytes: a note or rest costs 2, an instrument change 2, a legato marker 1, plus 1 for the end. That is about 120 notes. When a pattern is too long a message asks you to split it into two.',
      ] },
      { type: 'h', text: 'The order list' },
      { type: 'p', text: 'Press [[o]] to move the keyboard between the pattern grid and the order list of the current voice (a click on an order entry does it too). In the order list:' },
      { type: 'ul', items: [
        '[[Up]] and [[Down]] walk through the entries; [[Home]] and [[End]] go to the first and the last.',
        '[[+]] and [[-]] choose the pattern number of the entry, or hex digits type it.',
        '`[` and `]` transpose the entry by a semitone down and up; `{` and `}` by an octave.',
        '[[Insert]] adds an entry after this one, [[Backspace]] or [[Delete]] removes it.',
        '[[s]] makes the entry STOP, [[l]] makes it LOOP to entry 00 (then [[+]] and [[-]] choose another target), [[p]] makes it a pattern entry again.',
        '[[Enter]] goes back to the pattern grid. Alt+[[Up]] and Alt+[[Down]] move to the previous and next entry from the pattern grid.',
      ] },
      { type: 'note', text: 'A voice needs a STOP or a LOOP at the end of its order list to behave. Without one the tracker adds a STOP when it exports. If a loop goes round without any note or rest in it, the voice stops by itself after a few entries rather than hang.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'instruments',
    title: 'Instruments',
    blocks: [
      { type: 'p', text: 'An instrument is a set of fields, and the player applies them every frame while a note sounds. You will find them in the panel on the right. Fields that matter when a note begins (waveform, envelope, start pulse width and sweep step) are heard from the next note, and so are vibrato depth and speed (setting the depth to 0 stops a vibrato at once). The others (arpeggio, release, pulse limits) are heard at once.' },
      { type: 'h', text: 'The fields' },
      { type: 'table', head: ['Group', 'Field and what it does'], rows: [
        ['**Waveform**', 'Triangle is soft and flute-like, saw is bright and buzzy, pulse is full and its colour depends on the pulse width, noise is hiss for drums and effects. Triangle, saw and pulse can be combined (the SID mixes them, often to something thin, so use your ears); noise cannot be mixed. **Ring** (ring modulation, works with triangle) and **Sync** (hard sync with the voice before) are colour effects on top.'],
        ['**Envelope**', '**Attack** is how long the volume takes to rise to full (0 is a hard start of 2 ms, high values fade the note in). **Decay** is the fall from full volume to the sustain level. **Sustain** (0 to 15) is the level the note rests at while it is held: 0 lets it die away by itself, 15 is full volume. The times shown are the real SID times. There is no Release setting: it would never be heard, because the player closes every note its own way; see Release frames below. (The editor shows it as not used, and offers to clear it if an old file has one.)'],
        ['**Pulse width**', '**Start width** is the width at the start of every note: 50 percent is a hollow square, small and large values sound thin and nasal, 0 and 100 are silent. **Sweep step** is added to the width every frame (signed, -128 to 127; 0 keeps it still): the movement is what makes a pulse sound fat. **Sweep min** and **max** are the turning points; when the width reaches one the sweep turns around. Stay away from 0 percent. Only audible with the pulse waveform.'],
        ['**Vibrato**', '**Delay** is the number of frames after the note starts before the wobble begins, so long notes come alive and short notes stay clean. **Depth** is the width of the wobble, in 16ths of a semitone, to each side (16 is a whole semitone; 0 is off), and sounds equally wide in bass and treble. **Speed** is the number of frames of one swing (low is fast; 3 to 5 sounds natural; an odd number counts as the even one below). Changing the depth while a note sounds needs a new note; setting it to 0 stops it at once.'],
        ['**Arpeggio**', '**Offset** in semitones. On every second frame the pitch jumps to the note plus the offset, so it flutters between two pitches 25 times a second. 12 is an octave, 7 a fifth, 4 a major third. Fast enough, the ear hears a chord. 0 is off.'],
        ['**Drum**', '**Noise frames** above 0 makes the instrument a drum: the note starts with that many frames of noise at the pitch of the note. **Fall** is how fast the tone drops afterwards, in SID frequency register units per frame (large is a quick boom, 0 keeps the pitch).'],
        ['**Release frames**', 'The last N frames of every note are used to close the gate and clear the envelope, so the next note starts clean, without a click. 2 is the standard. It counts frames, not ticks. The first frame of a note always sounds. The SID needs almost two frames before a closed gate really starts to release, and a note that opens its gate sooner can start up to two frames late. So when the decay is above 0, 0 and 1 are played as 2, and a note of 1 or 2 frames keeps its gate open to its end instead; with decay 0 one frame is enough. Anything above 32 is played as 32.'],
      ] },
      { type: 'h', text: 'How drums work' },
      { type: 'p', text: 'There is no separate drum voice. A drum is an instrument with **Noise frames** above 0, played as a note. For the first frames the voice makes noise (a click for a kick, a crack for a snare), then the waveform you chose takes over at the same pitch and falls by **Fall** every frame. A kick is a short noise click followed by a low tone that drops quickly; a snare is a longer noise burst on a higher note; a hat is a very short burst of noise with no fall. The pitch you play decides the character, so put kicks on low notes and hats on high notes. The pulse sweep still works on a drum; vibrato and arpeggio do not.' },
      { type: 'tip', text: 'Put the drums on one voice and play them as a normal pattern. A hit takes the whole voice for its length, so keep drum notes short (1 tick) and let the rest after them hold the beat.' },
      { type: 'h', text: 'Presets and recipes' },
      { type: 'p', text: 'The preset buttons replace all fields of the selected instrument with a starting point (the name is kept unless it is still a "New" placeholder). Here is what they set, so you can reason about changing them. Percentages are the pulse width; "step" is the sweep step.' },
      { type: 'table', head: ['Sound', 'Recipe'], rows: [
        ['**Bass**', 'Pulse, attack 0, decay 8 (300 ms), sustain 10. Start 50 percent, step 10, sweep between 19 and 81 percent. A fat pulse that moves slowly. Play it low.'],
        ['**Lead**', 'Pulse, attack 0, decay 8, sustain 10. Start 50 percent, step 6, sweep between 25 and 75 percent. Vibrato delay 12 (a quarter second), depth 5, speed 4.'],
        ['**Pad**', 'Pulse, attack 9 (250 ms), decay 8, sustain 12. Start 50 percent, step 3, sweep between 19 and 81 percent. Vibrato delay 30, depth 4, speed 5. For long notes.'],
        ['**Pluck**', 'Pulse, attack 0, decay 5 (168 ms), sustain 0, so the note dies away by itself. Start 25 percent, step 20, sweep between 12 and 50 percent.'],
        ['**Kick**', 'Triangle, decay 6, sustain 0. Noise frames 1, fall 120. Play around C-2.'],
        ['**Snare**', 'Pulse at 50 percent, decay 4, sustain 0. Noise frames 3, fall 80. Play around C-3 or C-4.'],
        ['**Hat**', 'Noise waveform, decay 2, sustain 0. Noise frames 2, fall 0. A higher note sounds brighter.'],
      ] },
      { type: 'h', text: 'Arpeggio chords' },
      { type: 'p', text: 'The SID has only three voices, so a chord is usually faked. Give an instrument an arpeggio offset of 4 and every note you play on it flutters between itself and the note a major third higher; with 3 it is a minor third, with 7 a fifth, with 12 an octave. Held notes sound like a two-note chord with a shimmer. For a full triad, play the root on one voice with an arpeggio of 4 or 3 and the fifth on another voice, or alternate notes in the pattern yourself on a single voice.' },
      { type: 'h', text: 'Pulse sweep' },
      { type: 'p', text: 'A pulse wave that stays at one width sounds static. Moving the width a little every frame makes it shimmer, and that movement is the typical SID lead and bass sound. Choose a start width around 50 percent, a small sweep step (3 to 20) and set min and max so the width travels within the thin-to-full range. A bigger step moves faster. The graph in the panel shows the sweep range.' },
      { type: 'h', text: 'Vibrato' },
      { type: 'p', text: 'Start with delay 12, depth 5 and speed 4 (the Lead preset). Increase the depth for a wider wobble, the delay for a note that stays clean longer before it starts to move. Short notes never reach the delay, so they stay plain. Vibrato is not applied to drums.' },
      { type: 'h', text: 'Managing instruments' },
      { type: 'p', text: 'New adds an instrument, Duplicate copies the selected one and Delete removes it. Delete does not renumber the others, so instrument numbers in your patterns stay valid. If a song still uses an instrument that no longer exists the tracker warns you. The on-screen piano at the bottom of the panel (and the same keys as in the pattern editor while the focus is in the panel) plays the instrument.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'live',
    title: 'Playing and editing live',
    blocks: [
      { type: 'p', text: 'The tracker is built to be edited while it plays. Every change you make is sent to the running player between two frames, and the playing position is kept, so you hear an edit the next time the song reaches it.' },
      { type: 'ul', items: [
        '**Play** starts from the beginning, **From cursor** ([[Shift]]+[[Space]]) starts all three voices at the row of the cursor, and [[Space]] toggles between play and stop.',
        '**Follow** (the checkbox in the editor bar) scrolls the grid along with the song. Switch it off to look at one place while the song goes on elsewhere.',
        '**Mute** (M1, M2, M3) silences a voice for your ears only. Nothing in the project or the export changes.',
        '**Change the chip** (6581 or 8580), the volume or the speed while playing; the speed also changes the tempo you hear at once.',
        '**Edit patterns, order lists and instruments** while the song plays. Changes of the instrument sound that are applied per frame are heard immediately; the others start with the next note.',
        '**Undo** with [[Ctrl]]+[[Z]] (or [[Cmd]]+[[Z]]) and redo with [[Ctrl]]+[[Shift]]+[[Z]] or [[Ctrl]]+[[Y]]. The tooltip on the buttons names the step. Quick successive changes of the same thing, such as typing a speed, count as one step.',
      ] },
      { type: 'note', text: 'If an edit makes the project break a limit, the message strip lists the problems and playback carries on with the last good version. Fix the problems and the live link picks up again.' },
      { type: 'p', text: 'When the song is stopped, note keys and the on-screen piano play a single note with the current instrument, which is the way to try sounds while you build an instrument.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'files',
    title: 'Files and export',
    blocks: [
      { type: 'h', text: 'Project files' },
      { type: 'p', text: '**Save** writes the whole project, all instruments and the song, as a JSON text file; **Open** reads one back. This is the file to keep, share and put in version control. The tracker also stores an automatic copy in your browser (see the FAQ for the caveats).' },
      { type: 'h', text: 'What Export gives you' },
      { type: 'p', text: 'The Export dialog lists three files. Each can be downloaded; the text files can also be shown and copied.' },
      { type: 'table', head: ['File', 'What it is'], rows: [
        ['`instruments.asm`', 'The instrument tables, one table per field, shared by all your songs. Only as many entries as your highest used instrument needs.'],
        ['`song_<name>.asm`', 'The song, with the label `song_<name>` at its header. `<name>` is the song name made safe for a label.'],
        ['`<name>.prg`', 'A ready-to-run C64 program: a BASIC line, the player, your instruments and your song. Load it in VICE or on a C64 and RUN it.'],
      ] },
      { type: 'p', text: 'The two assembler files are ACME source. The player itself, `music.asm`, does not change from song to song: take it from the `src` folder of the WebSidTracker repository. The player and all exported files are MIT licensed.' },
      { type: 'h', text: 'Using the player in your own game' },
      { type: 'p', text: 'Put the three files in your project and include them:' },
      { type: 'code', text: '        !source "music.asm"            ; the player (it has no * = line)\n        !source "instruments.asm"\n        !source "song_title.asm"' },
      { type: 'p', text: 'Then start the song once, and call the player once per frame from your raster interrupt:' },
      { type: 'code', text: '        lda #<my_song        ; address of the song header\n        ldx #>my_song\n        jsr music_init       ; starts the song (volume is set to 15)\n        ...\nirq     jsr music_play       ; once per frame, from the raster interrupt\n        ...\n        jsr music_stop       ; silence, st_running = 0' },
      { type: 'ul', items: [
        '`music_init` takes the low byte of the song header address in A and the high byte in X, and clobbers A, X and Y. Calling it again switches to another song at once. There is no song table: you pick a song by its label.',
        '`music_play` must be called once per frame; it makes all the SID writes and clobbers A, X and Y. It clears the decimal flag, so it is safe from an interrupt that did not. When all voices have stopped it returns at once.',
        '`music_stop` writes 0 to all SID registers (volume too) and sets `st_running` to 0.',
        'The player writes only to the SID ($D400 to $D418), 14 bytes of zero page from $E0 (define `zp_music` before including `music.asm` to move them), at most 10 bytes of stack, and its own memory (about 1.5 KB).',
        'A normal frame takes about 1600 of the 19,656 cycles of a PAL frame; the longest frames in the demo song about 3300.',
      ] },
      { type: 'p', text: 'All details, the state block and the odd cases are in `docs/player.md` in the repository.' },
      { type: 'h', text: 'Memory map' },
      { type: 'p', text: 'In the tracker and in the exported .prg:' },
      { type: 'table', head: ['Range', 'Content'], rows: [
        ['`$0801-$0FFF`', 'The BASIC line `10 SYS 2064` and the small program that sets up the raster interrupt (only in the .prg).'],
        ['`$1000-$1FFF`', 'The player: code, frequency table and state block (about 1.5 KB).'],
        ['`$2000-$2EFF`', 'The 15 instrument tables of 256 bytes, in this order: `inst_wave`, `inst_ad`, `inst_sr`, `inst_pw_lo`, `inst_pw_hi`, `inst_pw_step`, `inst_pw_min`, `inst_pw_max`, `inst_vib_delay`, `inst_vib_depth`, `inst_vib_speed`, `inst_arp`, `inst_drum_noise`, `inst_drum_fall`, `inst_release`.'],
        ['`$3000-$BFFF`', 'The song (header at $3000). It must end below $C000.'],
        ['`$C000-`', 'Only in the tracker: a scratch song for playing single notes.'],
        ['`$E0-$ED`', 'Zero page used by the player.'],
      ] },
      { type: 'p', text: 'In your own game the addresses are yours: `music.asm` has no fixed address, and the instrument tables and the song can be anywhere. Only the exported .prg uses this map.' },
      { type: 'h', text: 'Limits' },
      { type: 'table', head: ['What', 'Limit'], rows: [
        ['speed', '1 to 255 frames per tick'],
        ['length of a note or rest', '1 to 255 ticks'],
        ['pitch', '0 to 95 (C-0 to B-7); after a transpose it is clamped to that range'],
        ['patterns per song', '254 (numbers 0 to 253)'],
        ['one pattern', '255 bytes including the end marker (a note or rest takes 2 bytes)'],
        ['order list', '128 entries per voice, STOP and LOOP included; a loop target is entry 0 to 127'],
        ['instruments', '256'],
        ['transpose', '-96 to 96 semitones'],
        ['release frames', '1 to 32 (with a decay above 0: 2 to 32; smaller values count as the smallest, more than 32 as 32)'],
        ['song size', 'it must end below $C000; the Free figure in the top bar shows what is left'],
        ['video standard', 'PAL only. NTSC (60 Hz) would play about 20 percent too fast and out of tune'],
      ] },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    blocks: [
      { type: 'p', text: 'These tables are read from the program itself, so they always match the version you are using. The note and editing keys work while the pattern editor has the focus (click the grid). Space, undo, save and the question mark work anywhere on the page except in a text field.' },
      { type: 'h', text: 'Everywhere' },
      { type: 'keys', source: 'app' },
      { type: 'h', text: 'Pattern editor and order list' },
      { type: 'keys', source: 'editor' },
      { type: 'h', text: 'Instrument panel' },
      { type: 'keys', source: 'instrument' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'faq',
    title: 'Troubleshooting and FAQ',
    blocks: [
      { type: 'h', text: 'I hear nothing' },
      { type: 'p', text: 'Browsers keep sound off until you click or press a key on the page, so the first Play or note key starts the audio engine; the line at the bottom of the page says when it is ready. Then check, in this order: the Vol slider in the top bar, the mute buttons M1 to M3, your system volume, and the message strip for an error. The page must be served by a web server (http or https); opened straight from a file it cannot load its sound code.' },
      { type: 'h', text: 'Which browsers work?' },
      { type: 'p', text: 'The tracker needs AudioWorklet, WebAssembly and JavaScript modules, which current versions of Chrome, Edge, Firefox and Safari provide. It is meant for a desktop browser with a keyboard; on a phone you can listen and look, but entering notes is awkward without one.' },
      { type: 'h', text: 'A note sounds shorter than I wrote' },
      { type: 'p', text: 'The last frames of every note are used to switch the sound off cleanly (the instrument\'s Release frames, 2 by default), so the next note starts without a click. At speed 6 a one-tick note is 6 frames long, of which 4 sound. At speed 1 a one-tick note sounds for one frame and nothing more. Notes of one or two frames keep their gate open instead (a gate-off of one frame is too short for the SID), and notes of three frames or more always start exactly on their tick. Use longer notes, a lower speed number with longer lengths, or fewer release frames. Drums are short on purpose.' },
      { type: 'h', text: 'My song stops' },
      { type: 'p', text: 'A voice stops when its order list reaches a STOP entry, and a new project has one right after its first pattern. Add a LOOP entry at the end instead to repeat; the loop goes to entry 00 unless you change the target. The voices end independently, and the song ends when all three have stopped. A loop that runs through patterns without any note or rest stops the voice after a few entries.' },
      { type: 'h', text: 'Nothing happens when I press a note key' },
      { type: 'p', text: 'Check that the focus is not in a text field (the song name, the pattern name, a number box): click the pattern grid first. While a song plays, a note key enters the note but does not play it.' },
      { type: 'h', text: 'How big can a song be?' },
      { type: 'p', text: 'The song data lives between $3000 and $BFFF, a little under 36 KB, far more than a tune needs; the demos take a few KB. Per pattern the limit is 255 bytes and per voice 128 order entries. The Free figure in the top bar shows what remains. Export is refused when a limit is broken.' },
      { type: 'h', text: 'Where is my work saved?' },
      { type: 'p', text: 'The tracker keeps an automatic copy in your browser\'s local storage on this device, and loads it the next time. That copy belongs to this browser and this web address: it is not there in another browser, on another computer, in a private window, after you clear site data, or on a different address (for example localhost compared to the published site). If the browser blocks storage the tracker still works, but nothing is remembered. Use **Save** to keep a file of anything you care about.' },
      { type: 'h', text: 'Does it sound the same on a real C64?' },
      { type: 'p', text: 'The notes, timing and instrument behaviour are the same because the real player code runs. The SID emulation is very good but not the chip itself, and 6581 chips vary from machine to machine. Export the .prg and listen in VICE (use its accurate x64sc emulator) or on hardware to check by ear.' },
      { type: 'h', text: 'Does it support NTSC?' },
      { type: 'p', text: 'Not yet. The frequency table and the timing are for PAL machines.' },
      { type: 'h', text: 'How do I report a bug?' },
      { type: 'p', text: 'Open an issue on the project page, [github.com/DDecoene/WebSidTracker/issues](https://github.com/DDecoene/WebSidTracker/issues). Say which browser and version you use, what you did, what you expected and what happened. If you can, attach the project file (Save) that shows the problem, and any message from the strip or from the browser console.' },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'about',
    title: 'About',
    blocks: [
      { type: 'p', text: 'WebSidTracker is written by Dennis Decoene. The source is at [github.com/DDecoene/WebSidTracker](https://github.com/DDecoene/WebSidTracker).' },
      { type: 'h', text: 'Licences' },
      { type: 'ul', items: [
        '**The player and everything the tracker exports** (`music.asm`, `instruments.asm`, the song files and the .prg) are MIT licensed. Your game can have any licence you like; a line in your credits is enough, for example: Music player by Dennis Decoene (WebSidTracker, MIT licence).',
        '**The web app** (the tracker itself) is free software under the GPL, version 3 or later, because it contains the reSIDfp sound chip emulation. That concerns the tracker, not your game and not the files you export from it.',
        'The songs and instruments you make are yours.',
      ] },
      { type: 'h', text: 'Credits' },
      { type: 'ul', items: [
        '**Sound.** The SID emulation is reSIDfp, by Dag Lem, Antti S. Lankila, Ken Händel and Leandro Nini, compiled to WebAssembly.',
        '**Music.** The demo songs are arrangements of public-domain compositions. The notes were read from public-domain editions of the scores, typeset for the Mutopia Project. The tune called Original is original.',
        '**Clean room.** The player is an original design. It contains no code, data, labels or byte formats from any other player or tracker, and it is not compatible with their formats on purpose.',
      ] },
    ],
  },
];

/** The section with this id, or undefined. */
export function findSection(id) {
  return SECTIONS.find((section) => section.id === id);
}
