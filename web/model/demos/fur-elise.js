// fur-elise.js - an arrangement of Beethoven's "Für Elise" (Bagatelle in A minor, WoO 59) for three SID voices.
//
// The composition is in the public domain; this arrangement (the instruments, the way the left hand is
// shared out over the voices, the pad, the small changes in the last pass) is original work.
//
// Time: the piece is in 3/8. One tick is one sixteenth note, so a bar is 6 ticks. Speed 12 frames per
// tick gives about 125 eighth notes per minute, a calm "poco moto".
//
// Voices:
//   1  melody, a soft pulse with a late vibrato (a bright music box in the last pass)
//   2  the left hand: broken chords on a triangle
//   3  a pad that holds one chord tone per bar, swelling in on every bar
// There are no drums.
//
// Form (ticks): intro 6 | A 42 | ending 1 6 | A 42 | ending 2 6 | B (F and C major, then E) 36 |
//               A in the new jacket 42 | close 12     = 192 ticks = 46 seconds, then it loops.
// The three voices have the same number of ticks in every section, so they stay together.
//
// Notes are written as text: "E5:2" is E in octave 5 for 2 ticks, "r:3" a rest of 3 ticks, "i1" selects
// instrument 1. Octaves follow the tracker: A4 is 440 Hz.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'fur-elise',
  title: 'Für Elise',
  composer: 'L. van Beethoven (public domain), arranged for SID',
  note: 'The rondo theme on a soft pulse lead with a late vibrato, the left-hand broken chords on a triangle and a slow pad; the last pass dresses the theme as a music box over fuller arpeggios.',
};

// "E5:1 r:2 i1" -> events
export function events(text) {
  return text.trim().split(/\s+/).map((token) => {
    if (token === 'l') return { type: 'legato' };
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, length] = token.split(':');
    if (name === 'r') return { type: 'rest', length: Number(length) };
    const pitch = parseNoteName(name);
    if (pitch === null || !(Number(length) >= 1)) throw new Error(`bad token "${token}"`);
    return { type: 'note', pitch, length: Number(length) };
  });
}

// ---------------------------------------------------------------- the notes, one line per bar

const LEAD_INTRO = 'i0 r:4 E5:1 D#5:1';            // the two-note upbeat

const LEAD_A = [                                    // the theme, seven bars
  'E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1',
  'A4:2 r:1 C4:1 E4:1 A4:1',
  'B4:2 r:1 E4:1 G#4:1 B4:1',
  'C5:2 r:1 E4:1 E5:1 D#5:1',
  'E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1',
  'A4:2 r:1 C4:1 E4:1 A4:1',
  'B4:2 r:1 E4:1 C5:1 B4:1',
].join(' ');

const LEAD_END1 = 'A4:2 r:2 E5:1 D#5:1';           // back to the theme (with its upbeat)
const LEAD_END2 = 'A4:2 r:1 B4:1 C5:1 D5:1';       // on into the second section

const LEAD_B = [                                    // F major, C major, then the way back through E
  'E5:3 G5:1 F5:1 E5:1',
  'D5:3 F5:1 E5:1 D5:1',
  'C5:3 E5:1 D5:1 C5:1',
  'B4:3 E4:1 E5:1 E6:1',
  'D#6:1 E6:1 D#6:1 E6:1 B5:1 D6:1',
  'C6:1 A5:3 E5:1 D#5:1',                           // ends on the upbeat of the theme
].join(' ');

const LEAD_CLOSE = 'A4:6  r:6';

// Left hand in the first two passes: the broken chord only on the first half of the bar.
const BASS_A = [
  'r:6',
  'A2:1 E3:1 A3:1 r:3',
  'E3:1 G#3:1 B3:1 r:3',
  'A2:1 E3:1 A3:1 r:3',
  'r:6',
  'A2:1 E3:1 A3:1 r:3',
  'E3:1 G#3:1 B3:1 r:3',
].join(' ');
const BASS_END = 'A2:1 E3:1 A3:1 r:3';

const BASS_B = [                                    // chords: F, G, C, E, E, A
  'F2:1 A2:1 C3:1 A2:1 C3:1 A2:1',
  'G2:1 B2:1 D3:1 B2:1 D3:1 B2:1',
  'C3:1 E3:1 G3:1 E3:1 G3:1 E3:1',
  'E2:1 G#2:1 B2:1 G#2:1 B2:1 G#2:1',
  'E3:1 G#3:1 B3:1 G#3:1 B3:1 G#3:1',
  'A2:1 C3:1 E3:1 A2:1 E3:1 C3:1',
].join(' ');

// Last pass: the left hand rolls through the whole bar.
const BASS_FULL = [
  'E2:1 B2:1 E3:1 G#3:1 E3:1 B2:1',
  'A2:1 E3:1 A3:1 E3:1 A2:1 E3:1',
  'E3:1 G#3:1 B3:1 G#3:1 E3:1 G#3:1',
  'A2:1 E3:1 A3:1 E3:1 A2:1 E3:1',
  'E2:1 B2:1 E3:1 G#3:1 E3:1 B2:1',
  'A2:1 E3:1 A3:1 E3:1 A2:1 E3:1',
  'E3:1 G#3:1 B3:1 G#3:1 E3:1 G#3:1',
].join(' ');
const BASS_CLOSE = 'A2:1 E3:1 A3:1 C4:1 E4:1 C4:1  A2:6';

// The pad holds the third (or the seventh) of the chord for a whole bar.
const PAD_A = 'G#3:6 C4:6 D4:6 E4:6 G#3:6 C4:6 D4:6';
const PAD_B = 'A3:6 B3:6 E4:6 G#3:6 G#3:6 C4:6';
const PAD_CLOSE = 'C4:6 E4:6';

// ---------------------------------------------------------------- instruments

const LEAD = 0, BASS = 1, PAD = 2, BOX = 3;

function instruments() {
  return [
    { // 0 soft pulse, narrow sweep, vibrato that comes in after 14 frames (only long notes get it)
      ...defaultInstrument(), name: 'Soft lead', wave: 0x40, ad: 0x1A, sr: 0x50, pw: 0x0900,
      pwStep: 3, pwMin: 0x40, pwMax: 0x90, vibDelay: 14, vibDepth: 5, vibSpeed: 4, release: 2,
    },
    { // 1 round triangle for the broken chords
      ...defaultInstrument(), name: 'Soft triangle', wave: 0x10, ad: 0x19, sr: 0xA0, release: 2,
    },
    { // 2 slow swell, a slowly breathing wide pulse
      ...defaultInstrument(), name: 'Warm pad', wave: 0x40, ad: 0x96, sr: 0x40, pw: 0x0800,
      pwStep: 2, pwMin: 0x30, pwMax: 0xD0, release: 2,
    },
    { // 3 music box: bright narrow pulse that dies away by itself
      ...defaultInstrument(), name: 'Music box', wave: 0x40, ad: 0x09, sr: 0x00, pw: 0x0500,
      pwStep: 0, release: 2,
    },
  ];
}

// ---------------------------------------------------------------- the project

export function build() {
  const patterns = [];
  const add = (name, text) => patterns.push({ name, events: events(text) }) - 1;

  const lead = [
    add('lead intro', LEAD_INTRO), add('lead theme', LEAD_A), add('lead ending 1', LEAD_END1),
    add('lead ending 2', LEAD_END2), add('lead second section', LEAD_B),
    add('lead theme, music box', `i${BOX} ${LEAD_A}`), add('lead close', LEAD_CLOSE),
  ];
  const bass = [
    add('bass intro', `i${BASS} r:6`), add('bass theme', BASS_A), add('bass ending', BASS_END),
    add('bass second section', BASS_B), add('bass theme, rolling', BASS_FULL), add('bass close', BASS_CLOSE),
  ];
  const pad = [
    add('pad intro', `i${PAD} G#3:6`), add('pad theme', PAD_A), add('pad ending', 'C4:6'),
    add('pad second section', PAD_B), add('pad close', PAD_CLOSE),
  ];
  const [lIntro, lTheme, lEnd1, lEnd2, lB, lBox, lClose] = lead;
  const [bIntro, bTheme, bEnd, bB, bFull, bClose] = bass;
  const [pIntro, pTheme, pEnd, pB, pClose] = pad;

  const order = (list) => [...list.map((pattern) => ({ pattern, transpose: 0 })), { loop: 0 }];
  return {
    instruments: instruments(),
    song: {
      name: 'Für Elise',
      speed: 12,
      patterns,
      orders: [
        order([lIntro, lTheme, lEnd1, lTheme, lEnd2, lB, lBox, lClose]),
        order([bIntro, bTheme, bEnd, bTheme, bEnd, bB, bFull, bClose]),
        order([pIntro, pTheme, pEnd, pTheme, pEnd, pB, pTheme, pClose]),
      ],
    },
  };
}
