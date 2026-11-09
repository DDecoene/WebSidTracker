// rondo-alla-turca.js - the Rondo alla Turca ("Alla Turca", third movement of the Piano Sonata No. 11 in
// A major, K. 331, W. A. Mozart), the whole movement with all its repeats, reduced from the piano score to
// three SID voices.
//
// Source: the Mutopia Project edition "Sonate Opus KV 331 - Rondo Alla Turca" (typeset in LilyPond by
// Rune Zedeler and Chris Sawer, Mutopia-2015/08/13-108, after the IMSLP edition; see `info.source`).
// The notes were taken from that edition's MIDI file (made from its LilyPond text, and compared with the
// printed score), cut into the three voices below by a small script, and compared with the file again
// after building (see the test). The composition and the edition are public domain.
//
// Time: 2/4, "Allegretto". One tick is one frame (speed 1, 50 ticks per second), so the score's note
// values are whole numbers of ticks at 125 quarter notes a minute (24 frames per quarter):
//   thirty-second 3, sixteenth 6, eighth 12, dotted eighth 18, quarter 24, half 48.
// A grace note of the score is one short note of 2 or 3 ticks just before the beat that it leads into,
// taken from the end of the note before it (a pair of them lasts 4 or 6 ticks). Where a sixteenth note
// of the left hand would be swallowed by a three-note strum, the strum has two notes.
//
// The two staves become three voices:
//   1  the tune: the highest note of the right hand (a pulse lead; the lower notes of its thirds, sixths
//      and octaves are left out)
//   2  the bass: the lowest note of every left-hand chord, and all the single left-hand notes
//   3  the chords: the left hand's two upper chord notes, played as one note that alternates with the
//      note above it every frame (an arpeggio instrument, one per interval), so it sounds like the chord
//      the piano plays on the off-beats.
// There are no drums, and the score has none: the "Turkish" march is the staccato bass-and-chord pattern
// of the left hand and, in the A major sections, its strummed grace notes.
//
// Form, as printed, with every repeat played: 223 bars, 3 min 34 s. Each section is played twice:
//   A      8 bars   the A minor theme (it starts with a quarter-note pickup that the last bar completes)
//   B     16 bars   the C major episode (8 bars), then the A minor theme again, over a new left hand (8 bars)
//   C      8 bars   A major: the right hand in octaves, the left hand strums
//   D      8 bars   A major: sixteenth-note runs
//   E     16 bars   the runs go on and come back to D
//   then C, A and B again, and the coda: 7.5 bars, a half-bar first ending, the 7.5 bars again, the
//   second ending and 31.5 bars to the final chords in A major.
// Then the three voices stop on the last chord.
//
// Notes are written as text: "E5:6" is E in octave 5 for 6 ticks, "R:12" is a rest, "i1" selects an
// instrument. Octaves follow the tracker: A4 is 440 Hz.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'rondo-alla-turca',
  title: 'Rondo alla Turca',
  composer: 'W. A. Mozart (public domain), arranged for SID',
  note: 'The whole third movement of the A major sonata K. 331, repeats included, from a printed score: the tune on a pulse lead, the left-hand bass, and the left-hand chords as arpeggios, at Allegretto.',
  source: {
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=108',
    files: 'https://www.mutopiaproject.org/ftp/MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca.mid',
    editor: 'Typeset in LilyPond by Rune Zedeler and Chris Sawer (Mutopia Project, Mutopia-2015/08/13-108), source: IMSLP',
    licence: 'Public Domain (placed in the public domain by the typesetter; the composition is also in the public domain)',
  },
};

// ---------------------------------------------------------------- note text

// "B4:6 R:12 i1" -> events. Note names are as in the tracker ("C4", "F#3"); A4 is 440 Hz.
export function parseNotes(text) {
  return text.trim().split(/\s+/).map((token) => {
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, length] = token.split(':');
    if (name === 'R') return { type: 'rest', length: Number(length) };
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`rondo-alla-turca: bad note "${token}"`);
    return { type: 'note', pitch, length: Number(length) };
  });
}

// ---------------------------------------------------------------- the three voices
// Every voice is a list of patterns of about 4 bars (cut at a note boundary) and an order list that
// plays them in the performance order, repeats included. A pattern name is its section letter and the
// number of the 4-bar piece in that section; ".2" marks another way of playing the same piece.

// Voice 1, the tune: the top note of the right hand.
const LEAD = {
  'A-1': `
    i0 B4:6 A4:6 G#4:6 A4:6 C5:12 R:12 D5:6 C5:6 B4:6 C5:6 E5:12 R:12 F5:6 E5:6 D#5:6 E5:6 B5:6 A5:6
    G#5:6 A5:6 B5:6 A5:6 G#5:6 A5:6 C6:24
  `,
  'A-2': `
    i0 A5:12 C6:6 G5:3 A5:3 B5:12 A5:12 G5:12 A5:6 G5:3 A5:3 B5:12 A5:12 G5:12 A5:6 G5:3 A5:3 B5:12
    A5:12 G5:12 F#5:12 E5:24
  `,
  'B-1': `
    i0 E5:12 F5:12 G5:12 G5:12 A5:6 G5:6 F5:6 E5:6 D5:24 E5:12 F5:12 G5:12 G5:12 A5:6 G5:6 F5:6 E5:6
    D5:24
  `,
  'B-2': `
    i0 C5:12 D5:12 E5:12 E5:12 F5:6 E5:6 D5:6 C5:6 B4:24 C5:12 D5:12 E5:12 E5:12 F5:6 E5:6 D5:6 C5:6
    B4:24
  `,
  'B-3': `
    i0 B4:6 A4:6 G#4:6 A4:6 C5:12 R:12 D5:6 C5:6 B4:6 C5:6 E5:12 R:12 F5:6 E5:6 D#5:6 E5:6 B5:6 A5:6
    G#5:6 A5:6 B5:6 A5:6 G#5:6 A5:6 C6:12 R:12
  `,
  'B-4': `
    i0 A5:12 B5:12 C6:12 B5:12 A5:12 G#5:12 A5:12 E5:12 F5:12 D5:12 C5:24 B4:18 A4:3 B4:3 A4:24
  `,
  'C-1': `
    i0 A5:12 B5:12 C#6:24 A5:12 B5:12 C#6:12 B5:12 A5:12 G#5:12 F#5:12 G#5:12 A5:12 B5:12 G#5:12 E5:12
  `,
  'C-2': `
    i0 A5:12 B5:12 C#6:24 A5:12 B5:12 C#6:12 B5:12 A5:12 G#5:12 F#5:12 B5:12 G#5:12 E5:12 A5:24
  `,
  'D-1': `
    i0 C#6:6 D6:6 C#6:6 B5:6 A5:6 B5:6 A5:6 G#5:6 F#5:6 A5:6 G#5:6 F#5:6 F5:6 F#5:6 G#5:6 F5:6 C#5:6
    D#5:6 F5:6 C#5:6 F#5:6 F5:6 F#5:6 G#5:6 A5:6 G#5:6 A5:6 B5:6 C#6:6 C6:6 C#6:6 C6:6
  `,
  'D-2': `
    i0 C#6:6 D6:6 C#6:6 B5:6 A5:6 B5:6 A5:6 G#5:6 F#5:6 A5:6 G#5:6 F#5:6 E5:6 F#5:6 G#5:6 E5:6 C#5:6
    D#5:6 E5:6 C#5:6 D#5:6 E5:6 F#5:6 D#5:6 C5:6 C#5:6 D#5:6 C5:6 C#5:24
  `,
  'E-1': `
    i0 E5:6 D5:6 C#5:6 B4:6 A4:6 B4:6 C#5:6 D5:6 E5:6 F#5:6 G#5:6 A5:6 A5:6 G#5:6 F#5:6 E5:6 E5:6 D5:6
    C#5:6 B4:6 A4:6 B4:6 C#5:6 D5:6 E5:6 F#5:6 G#5:6 A5:6 A#5:12 B5:12
  `,
  'E-2': `
    i0 E5:6 D5:6 C#5:6 B4:6 A4:6 B4:6 C#5:6 D5:6 E5:6 F#5:6 G#5:6 A5:6 A5:6 G#5:6 F#5:6 E5:6 E5:6 D5:6
    C#5:6 B4:6 C#5:6 E5:6 A4:6 C#5:6 B4:6 D5:6 G#4:6 B4:6 A4:24
  `,
  'E-4': `
    i0 C#6:6 C6:6 C#6:6 A#5:6 D6:6 C#6:6 D6:6 C#6:6 D6:6 C#6:6 D6:6 C#6:6 D6:6 C#6:6 B5:6 A5:6 G#5:6
    A5:6 B5:6 G#5:6 A5:6 B5:6 C#6:6 F#5:6 F5:6 F#5:6 G#5:6 F5:6 F#5:24
  `,
  'Coda-1': `
    i0 A4:6 A5:6 B4:6 B5:6 C#5:6 C#6:6 R:12 A4:6 A5:6 B4:6 B5:6 C#5:6 C#6:6 B4:6 B5:6 A4:6 A5:6 G#4:6
    G#5:6 F#4:6 F#5:6 G#4:6 G#5:6 A4:6 A5:6 B4:6 B5:6 G#4:6 G#5:6 E4:6 E5:6
  `,
  'Coda-2': `
    i0 A4:6 A5:6 B4:6 B5:6 C#5:6 C#6:6 R:12 A4:6 A5:6 B4:6 B5:6 C#5:6 C#6:6 B4:6 B5:6 A4:6 A5:6 G#4:6
    G#5:6 F#4:6 F#5:6 B4:6 B5:6 G#4:6 G#5:6 E4:6 E5:6
  `,
  'Ending1-1': `
    i0 A5:24
  `,
  'Final-1': `
    i0 A5:24 C#6:18 C#6:6 C#6:48 C#6:48 D6:6 C#6:6 B5:6 C#6:6 D6:6 C#6:6 B5:6 C#6:6
  `,
  'Final-2': `
    i0 D6:45 D6:3 C#6:9 D6:3 C#6:9 D6:3 C#6:9 D6:3 C#6:12 B5:36 E6:12 C#6:48
  `,
  'Final-3': `
    i0 C#6:48 D6:6 C#6:6 B5:6 C#6:6 D6:6 C#6:6 B5:6 C#6:6 D6:45 D6:3 C#6:45 C#6:3
  `,
  'Final-4': `
    i0 B5:9 C#6:3 B5:9 C#6:3 B5:9 C#6:3 B5:12 A5:18 E5:3 A5:3 C#6:18 C#6:2 E5:2 A5:2 C#6:42 E5:3 A5:3
    C#6:48
  `,
  'Final-5': `
    i0 D6:6 C#6:6 B5:6 C#6:6 D6:6 C#6:6 B5:6 C#6:6 D6:45 D6:3 C#6:9 D6:3 C#6:9 D6:3 C#6:9 D6:3 C#6:12
    B5:36 E6:12
  `,
  'Final-6': `
    i0 C#6:48 C#6:48 D6:6 C#6:6 B5:6 C#6:6 D6:6 C#6:6 B5:6 C#6:6 D6:45 D6:3
  `,
  'Final-7': `
    i0 C#6:45 C#6:3 B5:9 C#6:3 B5:9 C#6:3 B5:9 C#6:3 B5:12 A5:36 C#6:12 A5:36 E6:12
  `,
  'Final-8': `
    i0 A5:36 C#6:12 A5:12 C#6:12 A5:12 E6:12 A5:24 A5:24 A5:24
  `,
};

// The order of the lead patterns, repeats included.
const LEAD_ORDER = `
  A-1 A-2 A-1 A-2 B-1 B-2 B-3 B-4 B-1 B-2 B-3 B-4 C-1 C-2 C-1 C-2 D-1 D-2 D-1 D-2 E-1 E-2 D-1 E-4 E-1
  E-2 D-1 E-4 C-1 C-2 C-1 C-2 A-1 A-2 A-1 A-2 B-1 B-2 B-3 B-4 B-1 B-2 B-3 B-4 Coda-1 Coda-2 Ending1-1
  Coda-1 Coda-2 Final-1 Final-2 Final-3 Final-4 Final-5 Final-6 Final-7 Final-8
`;

// Voice 2, the bass: the lowest note of every left-hand chord and the single bass notes.
const BASS = {
  'A-1': `
    R:24 i1 A3:12 R:36 A3:12 R:36 A3:12 R:12 A3:12 R:12 A3:12 R:12
  `,
  'A-2': `
    R:24 i1 E3:12 R:36 E3:12 R:36 E3:12 R:12 B2:12 B3:12 E3:24
  `,
  'B-1': `
    R:24 i1 C3:12 C4:12 E3:12 E4:12 G3:24 R:24 C3:12 C4:12 E3:12 E4:12 G3:24
  `,
  'B-2': `
    R:24 i1 A2:12 A3:12 C3:12 C4:12 E3:24 R:24 A2:12 A3:12 C3:12 C4:12 E3:24
  `,
  'B-3': `
    R:24 i1 A3:12 R:36 A3:12 R:36 A3:12 R:12 A3:12 R:12 F3:12 R:12
  `,
  'B-4': `
    R:24 i1 E3:12 R:12 D3:12 R:12 C3:12 R:12 D3:12 R:84
  `,
  'C-1': `
    R:18 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2
    D2:2 F#2:2 A2:2 i1 D3:12 D3:6 i2 D#2:2 F#2:2 A2:2 i1 D#3:12 D#3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12 E3:12
  `,
  'C-2': `
    i1 E3:12 E3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12
    A3:6 i2 D2:2 F#2:2 A2:2 i1 D3:12 D3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12 E3:12 A2:24
  `,
  'D-1': `
    R:24 i1 F#3:12 R:36 G#3:12 R:36 F#3:12 R:36 F3:12 R:12
  `,
  'D-2': `
    R:24 i1 F#3:12 R:36 G#3:12 R:36 G#3:12 R:60
  `,
  'E-1': `
    R:24 i1 A3:12 R:36 B3:12 R:12 G#3:12 R:12 A3:12 R:36 E3:12 R:12
  `,
  'E-2': `
    R:24 i1 A3:12 R:36 B3:12 R:12 G#3:12 R:12 A3:12 F#3:12 D3:12 E3:12 A2:12 A3:12
  `,
  'E-3': `
    R:24 i1 F#3:12 R:36 G#3:12 R:36 F#3:12 R:36 C#3:12 R:12
  `,
  'E-4': `
    R:24 i1 B2:12 R:36 B2:12 R:36 C#3:12 R:12 C#3:12 R:36
  `,
  'Coda-2': `
    i1 E3:12 E3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12
    A3:6 i2 D2:2 F#2:2 A2:2 i1 D3:12 D3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12 E3:12
  `,
  'Ending1-1': `
    i1 A2:24
  `,
  'Coda-2.2': `
    i1 E3:12 E3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12
    A3:6 i2 D2:2 F#2:2 A2:2 i1 D3:12 D3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12 E3:6 i2 A2:2 C#3:2 E3:2
  `,
  'Final-1': `
    i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12
    A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 D2:2 F#2:2 A2:2
  `,
  'Final-2': `
    i1 D3:12 D3:12 D3:12 D3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12
    E3:12 E3:12 E3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2
  `,
  'Final-3': `
    i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 D2:2 F#2:2 A2:2 i1 D3:12
    D3:12 D3:12 D3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 E2:2 G#2:2 B2:2
  `,
  'Final-4': `
    i1 E3:12 E3:12 E3:12 E3:12 A3:6 E4:6 C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6 A3:6 E4:6
    C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6
  `,
  'Final-5': `
    i1 A3:6 E4:6 C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6 A3:6 F#4:6 D4:6 F#4:6 A3:6 F#4:6 D4:6 F#4:6 A3:6 E4:6
    C#4:6 E4:6 A3:6 E4:6 C#4:6 E4:6 E3:6 E4:6 G#3:6 E4:6 E3:6 E4:6 G#3:6 i2 E4:2 C#3:2 E3:2
  `,
  'Final-6': `
    i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12
    A3:12 A3:12 A3:6 i2 D2:2 F#2:2 A2:2 i1 D3:12 D3:12 D3:12 D3:6 i2 A2:2 C#3:2 E3:2
  `,
  'Final-7': `
    i1 A3:12 A3:12 A3:12 A3:6 i2 E2:2 G#2:2 B2:2 i1 E3:12 E3:12 E3:12 E3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12
    A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2
  `,
  'Final-8': `
    i1 A3:12 A3:12 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:6 i2 A2:2 C#3:2 E3:2 i1 A3:12 A3:12 A2:24
    A2:24 A2:24
  `,
};

// The order of the bass patterns.
const BASS_ORDER = `
  A-1 A-2 A-1 A-2 B-1 B-2 B-3 B-4 B-1 B-2 B-3 B-4 C-1 C-2 C-1 C-2 D-1 D-2 D-1 D-2 E-1 E-2 E-3 E-4 E-1
  E-2 E-3 E-4 C-1 C-2 C-1 C-2 A-1 A-2 A-1 A-2 B-1 B-2 B-3 B-4 B-1 B-2 B-3 B-4 C-1 Coda-2 Ending1-1 C-1
  Coda-2.2 Final-1 Final-2 Final-3 Final-4 Final-5 Final-6 Final-7 Final-8
`;

// Voice 3, the left-hand chords: the two chord notes above the bass as one arpeggio instrument.
const CHORD = {
  'A-1': `
    R:36 i5 C4:12 C4:12 C4:12 R:12 C4:12 C4:12 C4:12 R:12 C4:12 R:12 C4:12 R:12 C4:12
  `,
  'A-2': `
    i5 C4:12 C4:12 R:12 i6 B3:12 B3:12 B3:12 R:12 B3:12 B3:12 B3:12 R:12 B3:12 R:48
  `,
  'B-1': `
    R:192
  `,
  'B-3': `
    R:36 i5 C4:12 C4:12 C4:12 R:12 C4:12 C4:12 C4:12 R:12 C4:12 R:12 C4:12 R:12 i7 A3:12
  `,
  'B-4': `
    i7 A3:12 A3:12 R:12 i8 A3:12 R:12 i7 F3:12 R:12 i6 E3:12 R:12 i7 F3:12 i6 E3:12 E3:12 i5 E3:12 E3:12
    i9 A2:22 R:2
  `,
  'D-1': `
    R:36 i5 A3:12 A3:12 A3:12 R:12 i3 B3:12 B3:12 B3:12 R:12 i5 A3:12 A3:12 A3:12 R:12 i6 G#3:12
  `,
  'D-2': `
    i6 G#3:12 G#3:12 R:12 i5 A3:12 A3:12 A3:12 R:12 i4 C#4:12 C#4:12 C#4:12 R:12 D#4:12 D#4:12 D#4:12
    C#4:24
  `,
  'E-1': `
    R:36 i4 C#4:12 C#4:12 C#4:12 R:12 i3 D4:12 R:12 D4:12 R:12 i4 C#4:12 C#4:12 C#4:12 R:12 i7 G#3:12
  `,
  'E-2': `
    i7 G#3:12 G#3:12 R:12 i4 C#4:12 C#4:12 C#4:12 R:12 i3 D4:12 R:12 D4:12 R:72
  `,
  'E-4': `
    i7 G3:12 i8 F#3:12 R:12 i6 F#3:12 F#3:12 F#3:12 R:12 i4 G#3:12 G#3:12 G#3:12 R:12 F#3:12 R:12 G#3:12
    F#3:22 R:2
  `,
  'Coda-2': `
    R:168
  `,
  'Ending1-1': `
    R:24
  `,
  'Final-8': `
    R:120 i4 C#3:24 C#3:24
  `,
};

// The order of the chord patterns.
const CHORD_ORDER = `
  A-1 A-2 A-1 A-2 B-1 B-1 B-3 B-4 B-1 B-1 B-3 B-4 B-1 B-1 B-1 B-1 D-1 D-2 D-1 D-2 E-1 E-2 D-1 E-4 E-1
  E-2 D-1 E-4 B-1 B-1 B-1 B-1 A-1 A-2 A-1 A-2 B-1 B-1 B-3 B-4 B-1 B-1 B-3 B-4 B-1 Coda-2 Ending1-1 B-1
  Coda-2 B-1 B-1 B-1 B-1 B-1 B-1 B-1 Final-8
`;

// ---------------------------------------------------------------- instruments

// The left-hand chord as an arpeggio: the note and the note `interval` semitones above, alternating
// every frame (25 Hz). A narrow pulse with a quick decay, like a struck chord, softer than the lead.
const chord = (interval) => ({
  ...defaultInstrument(), name: `Chord +${interval}`, wave: 0x40, ad: 0x04, sr: 0x50, pw: 0x0400, arp: interval, release: 2,
});

// ---------------------------------------------------------------- the project

export function build() {
  const instruments = [
    { // 0 lead: a pulse of about 50 percent with a slow, narrow sweep and a vibrato that only the long notes live to hear
      ...defaultInstrument(), name: 'Lead', wave: 0x40, ad: 0x10, sr: 0xF0, pw: 0x0800,
      pwStep: 3, pwMin: 0x70, pwMax: 0x90, vibDelay: 12, vibDepth: 5, vibSpeed: 6, release: 1,
    },
    { // 1 bass: a pulse that is struck and settles on a lower level
      ...defaultInstrument(), name: 'Bass', wave: 0x40, ad: 0x06, sr: 0x70, pw: 0x0600, release: 2,
    },
    { // 2 bass for the quick strummed grace notes: shortest gap between notes
      ...defaultInstrument(), name: 'Bass strum', wave: 0x40, ad: 0x06, sr: 0x70, pw: 0x0600, release: 1,
    },
    chord(2),
    chord(3),
    chord(4),
    chord(5),
    chord(6),
    chord(7),
    chord(12),
  ];

  const patterns = [];
  const voices = [[LEAD, LEAD_ORDER, 'lead'], [BASS, BASS_ORDER, 'bass'], [CHORD, CHORD_ORDER, 'chord']].map(([table, orderText, voice]) => {
    const index = {};
    for (const [name, text] of Object.entries(table)) index[name] = patterns.push({ name: `${voice} ${name}`, events: parseNotes(text) }) - 1;
    const entries = orderText.trim().split(/\s+/).map((name) => ({ pattern: index[name], transpose: 0 }));
    return [...entries, { stop: true }];
  });

  return { instruments, song: { name: info.title, speed: 1, patterns, orders: voices } };
}
