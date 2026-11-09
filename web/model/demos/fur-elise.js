// fur-elise.js - Beethoven's "Fur Elise" (Bagatelle in A minor, WoO 59) arranged for three SID voices.
//
// The notes come from a public-domain engraving of the piano score (see info.source). They were read
// from the machine-readable files of that edition and written out here as text, so pitches and rhythm
// are those of the score; only the reduction from two piano staves to three voices is ours.
//
// Time: the piece is in 3/8. One tick is a sixth of a sixteenth note, the smallest unit in which every
// duration of the piece is a whole number: a sixteenth is 6 ticks, an eighth 12, a bar 36, a thirty-second
// note 3, and the sixteenth-note triplets of the big arpeggio 4 ticks per note. Speed 2 means two frames
// per tick: a quarter note (24 ticks) lasts 0.96 seconds, about 62 to the minute (the score says 72, "poco
// moto"; with whole frames only this and the double speed are possible, and the double speed is far too fast).
//
// Voices (the three SID voices mix equally, so the melody has the highest sustain level):
//   1  the right hand: the melody, the top note of every right-hand chord, a pulse with a slow sweep and a
//      late vibrato that only the long notes ever reach
//   2  the left hand: the lowest note of every left-hand chord and the broken-chord figures, on a triangle
//   3  the inner voices: the other notes of chords. Two notes become one pulse that flips between them every
//      frame (the arpeggio field: the ear hears a dyad), one note is played plainly. In the left-hand figures
//      the piano pedal keeps the chord ringing; voice 3 stands in for it with the bass note of the figure,
//      held softly after the figure ends (the "pedal" instrument). These pedal notes are not in the score.
//
// Notes the reduction leaves out: when more than two inner notes sound together only the upper two are
// kept (chords of four notes in the minor-key section), and a bass note that is doubled by the right hand's
// chord is not played twice. The two grace notes before the minor-key section and the one before the
// 32nd-note run are played as short notes of 2 ticks taken from the end of the note before them.
//
// Form (the repeats are written out): the theme, ending 1, the theme again, ending 2 | the F major, C major
// section, ending 1, again, ending 2 | the minor-key section with its arpeggio runs | the theme returns, the
// second section returns, the closing theme. The song loops: its last bar ends with the eighth rest before
// the upbeat of the first.
//
// Notes are written as text: "E5:6" is E in octave 5 for 6 ticks, "r:12" a rest of 12 ticks, "i1" selects
// instrument 1 and "|" marks a bar line (it only helps reading). Octaves follow the tracker: A4 is 440 Hz.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'fur-elise',
  title: 'Für Elise',
  composer: 'L. van Beethoven (public domain), arranged for SID',
  note: 'The whole bagatelle in three voices: the rondo theme on a pulse lead, the left hand on a triangle, the inner voices as arpeggio chords, with every repeat written out.',
  source: 'Score: Mutopia Project, piano edition of Fur Elise WoO 59 from Breitkopf & Haertel 1888, typeset in LilyPond by Stelios Samelis, '
    + 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931 (licence: Public Domain). Music: Beethoven, public domain. The SID arrangement is original work.',
};

// "E5:1 r:2 i1 |" -> events
export function events(text) {
  return text.trim().split(/\s+/).filter((token) => token !== '|').map((token) => {
    if (token === 'l') return { type: 'legato' };
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, length] = token.split(':');
    if (name === 'r') return { type: 'rest', length: Number(length) };
    const pitch = parseNoteName(name);
    if (pitch === null || !(Number(length) >= 1)) throw new Error(`bad token "${token}"`);
    return { type: 'note', pitch, length: Number(length) };
  });
}

export const SPEED = 2;          // frames per tick
export const BAR = 36;           // ticks per bar

// ---------------------------------------------------------------- instruments

const [LEAD, LEFT, INNER, PEDAL] = [0, 1, 2, 3];

// Arpeggio offsets (semitones) of the inner-voice dyads that occur, instrument 4 and up in this order.
export const DYADS = [2, 3, 4, 6];

function instruments() {
  const make = (fields) => ({ ...defaultInstrument(), ...fields });
  return [
    // pulse near 50 percent, the width drifts slowly between 40 and 60 percent; the vibrato starts after
    // 14 frames, so notes shorter than 7 ticks stay clean; highest sustain of the three voices
    make({ name: 'Lead', wave: 0x40, ad: 0x15, sr: 0xE0, pw: 0x0800, pwStep: 3, pwMin: 0x66, pwMax: 0x99,
      vibDelay: 14, vibDepth: 4, vibSpeed: 4, release: 2 }),
    // round triangle, softer than the lead and below its range
    make({ name: 'Left hand', wave: 0x10, ad: 0x14, sr: 0xC0, release: 2 }),
    // a thinner pulse for the inner notes, a little lower in level
    make({ name: 'Inner voice', wave: 0x40, ad: 0x15, sr: 0x90, pw: 0x0700, pwStep: 2, pwMin: 0x50, pwMax: 0xA0, release: 2 }),
    // the pedal: fades in softly, held under the next figure
    make({ name: 'Pedal', wave: 0x40, ad: 0x45, sr: 0x70, pw: 0x0800, release: 2 }),
    // dyads: the inner pulse flips between the note and the note plus the offset
    ...DYADS.map((arp) => make({ name: `Inner dyad +${arp}`, wave: 0x40, ad: 0x15, sr: 0x90, pw: 0x0700, pwStep: 2, pwMin: 0x50, pwMax: 0xA0, arp, release: 2 })),
  ];
}

// ---------------------------------------------------------------- the notes, one pattern per section

const PATTERNS = {
  'lead pickup': `
    i0 E5:6 D#5:6
  `,
  'lead theme': `
    i0 E5:6 D#5:6 E5:6 B4:6 D5:6 C5:6
    A4:12 r:6 C4:6 E4:6 A4:6
    B4:12 r:6 E4:6 G#4:6 B4:6
    C5:12 r:6 E4:6 E5:6 D#5:6
    E5:6 D#5:6 E5:6 B4:6 D5:6 C5:6
    A4:12 r:6 C4:6 E4:6 A4:6
    B4:12 r:6 E4:6 C5:6 B4:6
  `,
  'lead ending 1': `
    i0 A4:24
  `,
  'lead ending 2': `
    i0 A4:12
    r:6 B4:6 C5:6 D5:6
  `,
  'lead B': `
    i0 E5:18 G4:6 F5:6 E5:6 D5:18 F4:6 E5:6 D5:6 C5:18 E4:6 D5:6 C5:6 B4:12
    r:6 E4:6 E5:6 E4:6 E5:6 E5:6
    E6:6 D#5:6 E5:6 D#5:6 E5:6 D#5:6
    E5:6 D#5:6 E5:6 D#5:6 E5:6 D#5:6
    E5:6 B4:6 D5:6 C5:6 A4:12
    r:6 C4:6 E4:6 A4:6 B4:12
    r:6 E4:6 G#4:6 B4:6 C5:12
    r:6 E4:6 E5:6 D#5:6 E5:6 D#5:6
    E5:6 B4:6 D5:6 C5:6 A4:12
    r:6 C4:6 E4:6 A4:6 B4:12
    r:6 E4:6 C5:6 B4:6
  `,
  'lead B ending 2': `
    i0 A4:12
    r:6 C5:6 C5:6 C5:2 F4:2 A4:2
  `,
  'lead C1': `
    i0 C5:24 F5:9 E5:3 E5:12
    D5:12 A#5:9 A5:3
  `,
  'lead C2': `
    i0 A5:6 G5:6
    F5:6 E5:6 D5:6 C5:6 A#4:12
    A4:10 A#4:2 A4:3 G4:3 A4:3 A#4:3
  `,
  'lead C3': `
    i0 C5:24 D5:6 D#5:6 E5:18 E5:6 F5:6 A4:6
  `,
  'lead C4': `
    i0 C5:24 D5:9 B4:3 C5:3 G5:3 G4:3 G5:3
    A4:3 G5:3 B4:3 G5:3 C5:3 G5:3 D5:3 G5:3
  `,
  'lead C5': `
    i0 E5:3 G5:3 C6:3 B5:3
    A5:3 G5:3 F5:3 E5:3 D5:3 G5:3 F5:3 D5:3 C5:3 G5:3 G4:3 G5:3
    A4:3 G5:3 B4:3 G5:3 C5:3 G5:3 D5:3 G5:3
  `,
  'lead C6': `
    i0 E5:3 G5:3 C6:3 B5:3
    A5:3 G5:3 F5:3 E5:3 D5:3 G5:3 F5:3 D5:3 E5:3 F5:3 E5:3 D#5:3
    E5:3 B4:3 E5:3 D#5:3 E5:3 B4:3 E5:3 D#5:3
  `,
  'lead C7': `
    i0 E5:18 B4:6 E5:6 D#5:6 E5:18 B4:6 E5:6 D#5:6
  `,
  'lead C8': `
    i0 E5:6 D#5:6
    E5:6 D#5:6 E5:6 D#5:6 E5:6 D#5:6
    E5:6 B4:6 D5:6 C5:6
  `,
  'lead C9': `
    i0 A4:12
    r:6 C4:6 E4:6 A4:6 B4:12
    r:6 E4:6 G#4:6 B4:6
  `,
  'lead C10': `
    i0 C5:12
    r:6 E4:6 E5:6 D#5:6 E5:6 D#5:6
    E5:6 B4:6 D5:6 C5:6
  `,
  'lead C11': `
    i0 A4:12
    r:6 C4:6 E4:6 A4:6 B4:12
    r:6 E4:6 C5:6 B4:6
  `,
  'lead C12': `
    i0 A4:12
    r:6 B4:6 C5:6 D5:6 E5:18 G4:6 F5:6 E5:6
  `,
  'lead C13': `
    i0 D5:18 F4:6 E5:6 D5:6 C5:18 E4:6 D5:6 C5:6
  `,
  'lead C14': `
    i0 B4:12
    r:6 E4:6 E5:6 E4:6 E5:6 E5:6
    E6:6 D#5:6 E5:6 D#5:6
  `,
  'lead C19': `
    i0 A4:12
    r:24 C#5:36
  `,
  'lead C20': `
    i0 D5:24 E5:6 F5:6 F5:24 F5:12
  `,
  'lead C21': `
    i0 E5:36 D5:24 C5:6 B4:6
  `,
  'lead C22': `
    i0 A4:24 A4:12 A4:12
    C5:12 B4:12
  `,
  'lead C23': `
    i0 A4:36 C#5:36
  `,
  'lead C25': `
    i0 F5:36 D#5:24 D5:6 C5:6
  `,
  'lead C26': `
    i0 A#4:24 A4:12 G#4:24 G#4:12
  `,
  'lead C27': `
    i0 A4:24 r:12 B4:12
    r:24
  `,
  'lead C28': `
    i0 A3:4 C4:4 E4:4
    A4:4 C5:4 E5:4 D5:4 C5:4 B4:4 A4:4 C5:4 E5:4
    A5:4 C6:4 E6:4 D6:4 C6:4 B5:4
  `,
  'lead C29': `
    i0 A5:4 C6:4 E6:4
    A6:4 C7:4 E7:4 D7:4 C7:4 B6:4 A#6:4 A6:4 G#6:4
    G6:4 F#6:4 F6:4 E6:4 D#6:4 D6:4
  `,
  'lead C30': `
    i0 C#6:4 C6:4 B5:4
    A#5:4 A5:4 G#5:4 G5:4 F#5:4 F5:4 E5:6 D#5:6
    E5:6 B4:6 D5:6 C5:6
  `,
  'lead C40': `
    i0 A4:12
    r:6 C4:6 E4:6 A4:6 B4:12
    r:6 E4:6 C5:6 B4:6 A4:12
    r:12
  `,
  'bass pickup': `
    r:12
  `,
  'bass theme': `
    r:36 i1
    A2:6 E3:6 A3:6 r:18
    E2:6 E3:6 G#3:6 r:18
    A2:6 E3:6 A3:6 r:54
    A2:6 E3:6 A3:6 r:18
    E2:6 E3:6 G#3:6 r:18
  `,
  'bass ending 1': `
    i1 A2:6 E3:6 A3:6 r:6
  `,
  'bass ending 2': `
    i1 A2:6 E3:6
    A3:6 r:18
  `,
  'bass B': `
    i1 C3:6 G3:6
    C4:6 r:18 G2:6 G3:6
    B3:6 r:18 A2:6 E3:6
    A3:6 r:18 E2:6 E3:6
    E4:6 r:126 A2:6 E3:6
    A3:6 r:18 E2:6 E3:6
    G#3:6 r:18 A2:6 E3:6
    A3:6 r:54 A2:6 E3:6
    A3:6 r:18 E2:6 E3:6
    G#3:6 r:18
  `,
  'bass B ending 2': `
    i1 A2:6 E3:6
    A3:6 A#3:6 A3:6 G3:6
  `,
  'bass C1': `
    i1 F3:6 A3:6
    C4:6 A3:6 C4:6 A3:6 F3:6 A#3:6
    D4:6 A#3:6 D4:6 A#3:6
  `,
  'bass C2': `
    i1 F3:6 E4:6
    F3:6 E4:6 F3:6 E4:6 F3:6 A3:6
    C4:6 A3:6 C4:6 A3:6
  `,
  'bass C3': `
    i1 F3:6 A3:6
    C4:6 A3:6 C4:6 A3:6 E3:6 A3:6
    C4:6 A3:6 D3:6 F3:6
  `,
  'bass C4': `
    i1 G3:6 E4:6
    G3:6 E4:6 G3:6 F4:6 C4:12
    r:6 F4:6 E4:6 D4:6
  `,
  'bass C5': `
    i1 C4:12
    F3:12 G3:12 C4:12
    r:6 F4:6 E4:6 D4:6
  `,
  'bass C6': `
    i1 C4:12
    F3:12 G3:12 G#3:12
    r:24
  `,
  'bass C7': `
    r:72
  `,
  'bass C9': `
    i1 A2:6 E3:6
    A3:6 r:18 E2:6 E3:6
    G#3:6 r:18
  `,
  'bass C10': `
    i1 A2:6 E3:6
    A3:6 r:54
  `,
  'bass C12': `
    i1 A2:6 E3:6
    A3:6 r:18 C3:6 G3:6
    C4:6 r:18
  `,
  'bass C13': `
    i1 G2:6 G3:6
    B3:6 r:18 A2:6 E3:6
    A3:6 r:18
  `,
  'bass C14': `
    i1 E2:6 E3:6
    E4:6 r:54
  `,
  'bass C19': `
    i1 A2:6 A2:6
    A2:6 A2:6 A2:6 A2:6 A2:6 A2:6
    A2:6 A2:6 A2:6 A2:6
  `,
  'bass C21': `
    i1 A2:6 A2:6
    A2:6 A2:6 A2:6 A2:6 D2:6 D2:6
    D2:6 D2:6 D2:6 D2:6
  `,
  'bass C22': `
    i1 D#2:6 D#2:6
    D#2:6 D#2:6 D#2:6 D#2:6 E2:6 E2:6
    E2:6 E2:6 E2:6 E2:6
  `,
  'bass C23': `
    i1 A1:6 A2:6
    A2:6 A2:6 A2:6 A2:6 A2:6 A2:6
    A2:6 A2:6 A2:6 A2:6
  `,
  'bass C25': `
    i1 A#2:6 A#2:6
    A#2:6 A#2:6 A#2:6 A#2:6 A#2:6 A#2:6
    A#2:6 A#2:6 A#2:6 A#2:6
  `,
  'bass C26': `
    i1 A#2:6 A#2:6
    A#2:6 A#2:6 A#2:6 A#2:6 B2:6 B2:6
    B2:6 B2:6 B2:6 B2:6
  `,
  'bass C27': `
    i1 C3:24 r:12 E3:12
    r:24
  `,
  'bass C28': `
    i1 A1:12
    r:12 A3:12 A3:12
    r:12 A3:12
  `,
  'bass C29': `
    i1 A3:12
    r:12 A3:12 A3:12
    r:24
  `,
  'bass C40': `
    i1 A2:6 E3:6
    A3:6 r:18 E2:6 E3:6
    G#3:6 r:18 A1:12
    r:12
  `,
  'inner pickup': `
    r:12
  `,
  'inner theme': `
    r:54 i3 A2:18
    r:18 E2:18
    r:18 A2:18
    r:54 A2:18
    r:18 E2:18
  `,
  'inner ending 1': `
    r:18 i3 A2:6
  `,
  'inner ending 2': `
    r:18 i3 A2:18
  `,
  'inner B': `
    r:18 i3 C3:18 r:18 G2:18 r:18 A2:18 r:18 E2:18 r:126 A2:18 r:18 E2:18 r:18 A2:18 r:54 A2:18 r:18 E2:18
  `,
  'inner B ending 2': `
    r:18 i2 E4:6 F4:6 i5 E4:2 r:4
  `,
  'inner C1': `
    r:72
  `,
  'inner C2': `
    r:12 i5
    G3:6 r:6 G3:6 r:42
  `,
  'inner C3': `
    r:60 i2 D4:6 r:6
  `,
  'inner C4': `
    r:36 i2 E4:12
    r:6 G4:6 G4:6 i4 F4:6
  `,
  'inner C5': `
    i5 E4:12 i2
    A3:12 B3:12 r:18 G4:6 G4:6 i4 F4:6
  `,
  'inner C6': `
    i5 E4:12 i2
    A3:12 B3:12 B3:12
    r:24
  `,
  'inner C9': `
    r:18 i3 A2:18 r:18 E2:18
  `,
  'inner C10': `
    r:18 i3 A2:18 r:36
  `,
  'inner C12': `
    r:18 i3 A2:18 r:18 C3:18
  `,
  'inner C13': `
    r:18 i3 G2:18 r:18 A2:18
  `,
  'inner C14': `
    r:18 i3 E2:18 r:36
  `,
  'inner C19': `
    r:36 i5 G4:36
  `,
  'inner C20': `
    i6 F4:24 i2 C#5:6 D5:6 i7 G#4:24 G#4:12
  `,
  'inner C21': `
    i5 A4:36 i2 F4:6 A2:6
    A2:6 A2:6 E4:6 D4:6
  `,
  'inner C22': `
    i7 C4:6 i2 A2:6
    A2:6 A2:6 C4:6 A2:6 C4:6 A2:6
    E4:6 A2:6 D4:6 G#2:6
  `,
  'inner C23': `
    i2 C4:36 i5 G4:36
  `,
  'inner C24': `
    i6 F4:24 i2 C#5:6 D5:6 D5:24 D5:12
  `,
  'inner C25': `
    i2 D5:36 G4:24 F4:6 D#4:6
  `,
  'inner C26': `
    i5 D4:24 D4:12 D4:24 D4:12
  `,
  'inner C27': `
    i6 C4:24 r:12 i2 E4:12
    r:24
  `,
  'inner C28': `
    r:24 i6 C4:12 C4:12
    r:12 C4:12
  `,
  'inner C29': `
    i6 C4:12
    r:12 C4:12 C4:12
    r:24
  `,
  'inner C40': `
    r:18 i3 A2:18 r:18 E2:18 i2 A2:12
    r:12
  `,
};

// Which pattern each voice plays, in order. The three lists have the same length in ticks, section by section.
const ORDERS = {
  lead: [
  'lead pickup', 'lead theme', 'lead ending 1', 'lead pickup',
  'lead theme', 'lead ending 2', 'lead B', 'lead ending 2',
  'lead B', 'lead B ending 2', 'lead C1', 'lead C2',
  'lead C3', 'lead C4', 'lead C5', 'lead C6',
  'lead C7', 'lead C8', 'lead C9', 'lead C10',
  'lead C11', 'lead C12', 'lead C13', 'lead C14',
  'lead C8', 'lead C9', 'lead C10', 'lead C11',
  'lead C19', 'lead C20', 'lead C21', 'lead C22',
  'lead C23', 'lead C20', 'lead C25', 'lead C26',
  'lead C27', 'lead C28', 'lead C29', 'lead C30',
  'lead C9', 'lead C10', 'lead C11', 'lead C12',
  'lead C13', 'lead C14', 'lead C8', 'lead C9',
  'lead C10', 'lead C40',
],
  left: [
  'bass pickup', 'bass theme', 'bass ending 1', 'bass pickup',
  'bass theme', 'bass ending 2', 'bass B', 'bass ending 2',
  'bass B', 'bass B ending 2', 'bass C1', 'bass C2',
  'bass C3', 'bass C4', 'bass C5', 'bass C6',
  'bass C7', 'bass C7', 'bass C9', 'bass C10',
  'bass C9', 'bass C12', 'bass C13', 'bass C14',
  'bass C7', 'bass C9', 'bass C10', 'bass C9',
  'bass C19', 'bass C19', 'bass C21', 'bass C22',
  'bass C23', 'bass C19', 'bass C25', 'bass C26',
  'bass C27', 'bass C28', 'bass C29', 'bass C7',
  'bass C9', 'bass C10', 'bass C9', 'bass C12',
  'bass C13', 'bass C14', 'bass C7', 'bass C9',
  'bass C10', 'bass C40',
],
  inner: [
  'inner pickup', 'inner theme', 'inner ending 1', 'inner pickup',
  'inner theme', 'inner ending 2', 'inner B', 'inner ending 2',
  'inner B', 'inner B ending 2', 'inner C1', 'inner C2',
  'inner C3', 'inner C4', 'inner C5', 'inner C6',
  'inner C1', 'inner C1', 'inner C9', 'inner C10',
  'inner C9', 'inner C12', 'inner C13', 'inner C14',
  'inner C1', 'inner C9', 'inner C10', 'inner C9',
  'inner C19', 'inner C20', 'inner C21', 'inner C22',
  'inner C23', 'inner C24', 'inner C25', 'inner C26',
  'inner C27', 'inner C28', 'inner C29', 'inner C1',
  'inner C9', 'inner C10', 'inner C9', 'inner C12',
  'inner C13', 'inner C14', 'inner C1', 'inner C9',
  'inner C10', 'inner C40',
],
};

// ---------------------------------------------------------------- the project

export function build() {
  const names = Object.keys(PATTERNS);
  const patterns = names.map((name) => ({ name, events: events(PATTERNS[name]) }));
  const order = (list) => [...list.map((name) => ({ pattern: names.indexOf(name), transpose: 0 })), { loop: 0 }];
  return {
    instruments: instruments(),
    song: {
      name: 'Für Elise',
      speed: SPEED,
      patterns,
      orders: [order(ORDERS.lead), order(ORDERS.left), order(ORDERS.inner)],
    },
  };
}
