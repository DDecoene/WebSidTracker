// ode-to-joy.js - the starter demo: the "Ode to Joy" theme (L. van Beethoven, Symphony No. 9, last
// movement), in G major, from a real four-part score, reduced to three SID voices.
//
// Source: the Mutopia Project edition "Ode to Joy" (SATB hymn setting, typeset in LilyPond by Peter
// Chubb, Mutopia-2009/08/05-528). The notes below were read from that score's LilyPond text and
// checked against its MIDI file (see `info.source`). The composition and the edition are public domain.
//
// Time: 4/4, 16 bars. The score says quarter = 100. One tick is a third of a quarter note, so a bar is
// 24 ticks and every note value of the piece is a whole number of ticks:
//   eighth 3, quarter 6, dotted quarter 9, half 12.
// Speed 5 (5 frames per tick, 30 frames per quarter) gives exactly 100 quarters per minute.
//
// The four parts of the score are soprano (the tune), alto, tenor and bass. Voices:
//   1  the tune (soprano), a bright pulse with a late vibrato on long notes
//   2  the inner harmony: round 1 the alto line, round 2 the tenor and alto in alternation (an eighth
//      note each), a broken-chord figure that keeps the harmony of both inner parts
//   3  the bass line, a triangle
// There are no drums: the tune is the point, and three voices are all there is.
//
// Form: round 1 (16 bars = 384 ticks = 38.4 s), round 2 with the tune an octave higher and the inner
// voice as broken chords (another 38.4 s), then it loops. All three voices have the same number of ticks
// in every phrase and every round.
//
// Notes are written as text: "E5:6" is E in octave 5 for 6 ticks. Octaves follow the tracker: A4 is
// 440 Hz. Bars are separated by "|" for reading only.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  composer: 'L. van Beethoven (public domain), arranged for SID',
  note: 'The famous theme from the end of the Ninth Symphony in G major, at the score tempo of 100: a bright lead, the inner parts as harmony (in the second round as broken chords) and a triangle bass.',
  source: {
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
    files: 'https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly',
    editor: 'Typeset in LilyPond by Peter Chubb (Mutopia Project, Mutopia-2009/08/05-528)',
    licence: 'Public Domain (placed in the public domain by the typesetter; the composition is also in the public domain)',
  },
};

// ---------------------------------------------------------------- the score, four parts, 4 phrases of 4 bars
// "name:ticks", bars separated by "|".

export const SOPRANO = [
  'B4:6 B4:6 C5:6 D5:6 | D5:6 C5:6 B4:6 A4:6 | G4:6 G4:6 A4:6 B4:6 | B4:9 A4:3 A4:12',
  'B4:6 B4:6 C5:6 D5:6 | D5:6 C5:6 B4:6 A4:6 | G4:6 G4:6 A4:6 B4:6 | A4:9 G4:3 G4:12',
  'A4:6 A4:6 B4:6 G4:6 | A4:6 B4:3 C5:3 B4:6 G4:6 | A4:6 B4:3 C5:3 B4:6 A4:6 | G4:6 A4:6 D4:12',
  'B4:6 B4:6 C5:6 D5:6 | D5:6 C5:6 B4:6 A4:6 | G4:6 G4:6 A4:6 B4:6 | A4:9 G4:3 G4:12',
];
export const ALTO = [
  'G4:6 G4:6 A4:6 G4:6 | G4:9 A4:3 G4:6 F#4:6 | D4:6 D4:6 F#4:6 G4:6 | G4:9 F#4:3 F#4:12',
  'G4:6 G4:6 A4:6 G4:6 | G4:9 A4:3 G4:6 F#4:6 | D4:6 D4:6 F#4:6 G4:6 | G4:6 F#4:6 D4:12',
  'D4:6 D4:6 D4:6 D4:6 | D4:6 D4:6 D4:6 D4:6 | D4:6 D4:6 F#4:6 F#4:6 | E4:6 C#4:6 D4:12',
  'D4:6 G4:6 A4:6 A4:6 | B4:6 G4:3 A4:3 G4:6 E4:6 | E4:6 D4:6 F#4:6 G4:6 | G4:6 F#4:6 G4:12',
];
export const TENOR = [
  'D4:6 D4:6 C4:6 B3:6 | E4:9 D4:3 D4:6 D4:6 | B3:6 B3:6 D4:6 D4:6 | D4:9 D4:3 D4:12',
  'D4:6 D4:6 C4:6 B3:6 | E4:9 D4:3 D4:6 D4:6 | B3:6 B3:6 D4:6 D4:6 | D4:6 D4:6 B3:12',
  'F#3:6 F#3:6 G3:6 E3:6 | F#3:6 G3:3 A3:3 G3:6 E3:6 | F#3:6 F#3:6 F#3:6 B3:6 | B3:6 A3:6 G3:6 F#3:6',
  'G3:6 D4:6 F4:6 F4:6 | G4:9 D4:3 D4:6 C4:6 | G3:6 G3:6 C4:6 D4:6 | D4:6 D4:6 B3:12',
];
export const BASS = [
  'G3:6 G3:6 G3:6 G3:6 | E3:9 F#3:3 G3:6 D3:6 | B3:6 B3:6 A3:6 G3:6 | D3:9 D3:3 D3:12',
  'G3:6 G3:6 G3:6 G3:6 | E3:9 F#3:3 G3:6 D3:6 | B3:6 B3:6 A3:6 G3:6 | D3:6 D3:6 G2:12',
  'D3:6 D3:6 D3:6 D3:6 | D3:6 D3:6 D3:6 D3:6 | D3:6 D3:6 D#3:6 D#3:6 | E3:6 A2:6 D3:12',
  'G3:6 G3:6 F3:6 F3:6 | E3:9 F#3:3 G3:6 C3:6 | C3:6 B2:6 A2:6 G2:6 | D3:6 D3:6 G2:12',
];

export const TICKS_PER_BAR = 24;
export const TICKS_PER_PHRASE = 4 * TICKS_PER_BAR;
export const SLOT = 3;   // an eighth note: the step of the broken-chord figure in round 2

// ---------------------------------------------------------------- instruments

const [BASS_INST, LEAD, INNER] = [0, 1, 2];

function instruments() {
  const make = (fields) => ({ ...defaultInstrument(), ...fields });
  return [
    // Triangle bass: attack 0 is safe on a triangle (the oscillator restarts at zero), a short decay settles to sustain 12.
    make({ name: 'Bass', wave: 0x10, ad: 0x08, sr: 0xC0, release: 2 }),
    // Lead: pulse around 50 percent (40 to 60) with a slow sweep, loudest sustain (14), vibrato only after 16 frames.
    make({ name: 'Lead', wave: 0x40, ad: 0x18, sr: 0xE0, pw: 0x0800, pwStep: 4, pwMin: 0x68, pwMax: 0x98,
      vibDelay: 16, vibDepth: 5, vibSpeed: 6, release: 2 }),
    // Inner parts: a thinner pulse (about 25 percent), clearly softer (sustain 7) so the tune stays on top.
    make({ name: 'Inner', wave: 0x40, ad: 0x19, sr: 0x70, pw: 0x0400, pwStep: 3, pwMin: 0x30, pwMax: 0x58, release: 2 }),
  ];
}

// ---------------------------------------------------------------- helpers

const note = (pitch, length) => ({ type: 'note', pitch, length });
const inst = (instrument) => ({ type: 'inst', instrument });

// "G4:6 G4:6 | A4:6" -> [{pitch, length}]
function parse(text) {
  return text.split(/\s+/).filter((token) => token !== '|').map((token) => {
    const [name, length] = token.split(':');
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`bad note name ${name}`);
    return { pitch, length: Number(length) };
  });
}

// One pitch per tick.
function perTick(notes) {
  return notes.flatMap(({ pitch, length }) => Array(length).fill(pitch));
}

// Round 2 harmony: every eighth note slot alternates between the tenor note (first, third ... slot) and the alto
// note that sound at that moment. Equal neighbours become one longer note.
function brokenChords(tenorText, altoText) {
  const tenor = perTick(parse(tenorText));
  const alto = perTick(parse(altoText));
  const events = [];
  for (let slot = 0; slot * SLOT < tenor.length; slot++) {
    const pitch = (slot % 2 === 0 ? tenor : alto)[slot * SLOT];
    const last = events.at(-1);
    if (last && last.pitch === pitch) last.length += SLOT;
    else events.push(note(pitch, SLOT));
  }
  return events;
}

// ---------------------------------------------------------------- the project

export function build() {
  const patterns = [];
  const index = new Map();   // identical event lists share one pattern
  const add = (name, instrument, notes) => {
    const events = [inst(instrument), ...notes.map((n) => note(n.pitch, n.length))];
    const key = JSON.stringify(events);
    if (!index.has(key)) { index.set(key, patterns.length); patterns.push({ name, events }); }
    return index.get(key);
  };
  const phrases = (name, instrument, texts) => texts.map((text, i) => add(`${name} ${i + 1}`, instrument, parse(text)));
  const entry = (pattern, transpose = 0) => ({ pattern, transpose });

  const tune = phrases('tune', LEAD, SOPRANO);
  const alto = phrases('inner', INNER, ALTO);
  const chords = [0, 1, 2, 3].map((i) => add(`inner chords ${i + 1}`, INNER, brokenChords(TENOR[i], ALTO[i])));
  const bass = phrases('bass', BASS_INST, BASS);

  const round = (ids, transpose = 0) => ids.map((id) => entry(id, transpose));
  const orders = [
    [...round(tune), ...round(tune, 12), { loop: 0 }],
    [...round(alto), ...round(chords), { loop: 0 }],
    [...round(bass), ...round(bass), { loop: 0 }],
  ];

  return {
    instruments: instruments(),
    song: { name: 'Ode to Joy', speed: 5, patterns, orders },
  };
}
