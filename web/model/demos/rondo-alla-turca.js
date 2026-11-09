// rondo-alla-turca.js - an arrangement of the Rondo alla Turca (Mozart, public domain) for three SID voices.
//
// Voice 1: the tune. Voice 2: the left-hand "oom-pah" on a plucked pulse bass. Voice 3: a janissary
// drum feel (kick, hat, snare, a crash on every section start).
//
// Time: speed 5, one tick = one sixteenth note (100 ms), a bar of 2/4 is 8 ticks, a quarter is 4.
// Form (8 bars per section, 64 bars, about 51 seconds, then the whole song loops):
//   A minor theme, A minor theme again (new lead sound), A major section twice,
//   A minor theme, C major section twice, A minor theme.
// The A minor theme follows the well-known tune. The A major and C major sections are written to
// fit the same march (turns on the beat, rising arpeggios); the notes are written out below as
// text: "B4:1" is a note and its length in ticks, "R:2" is a rest, "i1" selects an instrument.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'rondo-alla-turca',
  title: 'Rondo alla Turca',
  composer: 'W. A. Mozart (public domain), arranged for SID',
  note: 'The A minor theme on a pulse lead over a plucked oom-pah bass and a kick, hat, snare "janissary" drum voice, with A major and C major contrasting sections.',
};

// ---------------------------------------------------------------- note text

// "B4:1 R:2 i1" -> events. Note names are as in the tracker ("C4", "F#3"); A4 is 440 Hz.
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

// ---------------------------------------------------------------- the tune, bar by bar (8 ticks each)

// Section 1 and 3: the A minor theme. Chords: Am Am E Am | Am E E Am.
const THEME = [
  'B4:1 A4:1 G#4:1 A4:1 C5:4',
  'D5:1 C5:1 B4:1 C5:1 E5:4',
  'F5:1 E5:1 D#5:1 E5:1 B5:1 A5:1 G#5:1 A5:1',
  'B5:1 A5:1 G#5:1 A5:1 C6:4',
  'A5:2 C6:2 B5:2 A5:2',
  'G#5:1 A5:1 B5:2 G#5:2 E5:2',
  'E5:2 D5:2 B4:2 G#4:2',
  'A4:6 R:2',
];

// The A major section. Chords: A A E A | A D E A.
const A_MAJOR = [
  'C#5:1 B4:1 C#5:1 A4:1 E5:4',
  'C#5:1 B4:1 C#5:1 A4:1 A5:4',
  'G#5:1 F#5:1 G#5:1 E5:1 B5:4',
  'F#5:1 E5:1 F#5:1 D5:1 C#5:4',
  'E5:2 A5:2 C#6:2 A5:2',
  'F#5:2 A5:2 D6:2 A5:2',
  'G#5:2 B5:2 E6:2 B5:2',
  'A5:6 R:2',
];

// The C major section. Chords: C C G C | C F G C.
const C_MAJOR = [
  'E5:1 D5:1 E5:1 C5:1 G5:4',
  'E5:1 D5:1 E5:1 C5:1 C6:4',
  'D5:1 C5:1 D5:1 B4:1 G5:4',
  'E5:1 D5:1 E5:1 C5:1 E5:4',
  'C5:2 E5:2 G5:2 C6:2',
  'F5:2 A5:2 C6:2 A5:2',
  'D5:2 G5:2 B5:2 G5:2',
  'C6:6 R:2',
];

// ---------------------------------------------------------------- the project

export function build() {
  const instruments = [
    { // 0 lead: pulse with a slow sweep and a late vibrato
      ...defaultInstrument(), name: 'Lead', wave: 0x40, ad: 0x19, sr: 0xA0, pw: 0x0800,
      pwStep: 8, pwMin: 0x30, pwMax: 0xC0, vibDelay: 8, vibDepth: 5, vibSpeed: 4, release: 2,
    },
    { // 1 bright lead (the repeats): sawtooth, a little more vibrato
      ...defaultInstrument(), name: 'Bright lead', wave: 0x20, ad: 0x09, sr: 0xB0,
      vibDelay: 6, vibDepth: 6, vibSpeed: 6, release: 2,
    },
    { // 2 pluck bass: pulse, fast decay to a low sustain
      ...defaultInstrument(), name: 'Pluck bass', wave: 0x40, ad: 0x04, sr: 0x40, pw: 0x0600,
      pwStep: 10, pwMin: 0x30, pwMax: 0xC0, release: 2,
    },
    { // 3 kick: one frame of noise, then a triangle that falls fast
      ...defaultInstrument(), name: 'Kick', wave: 0x10, ad: 0x05, sr: 0x00,
      drumNoise: 1, drumFall: 160, release: 2,
    },
    { // 4 snare: a few frames of noise, then a pulse body that falls
      ...defaultInstrument(), name: 'Snare', wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0400,
      drumNoise: 3, drumFall: 120, release: 2,
    },
    { // 5 hat: short noise
      ...defaultInstrument(), name: 'Hat', wave: 0x80, ad: 0x02, sr: 0x00,
      drumNoise: 255, drumFall: 0, release: 1,
    },
    { // 6 crash: noise that decays slowly
      ...defaultInstrument(), name: 'Crash', wave: 0x80, ad: 0x09, sr: 0x00,
      drumNoise: 255, drumFall: 0, release: 2,
    },
  ];
  const [LEAD, BRIGHT, PLUCK, KICK, SNARE, HAT, CRASH] = [0, 1, 2, 3, 4, 5, 6];

  const patterns = [];
  const add = (name, events) => patterns.push({ name, events }) - 1;

  // Tune patterns: one per section and lead sound (8 bars each).
  const tune = (name, bars, instrument) => add(name, [{ type: 'inst', instrument }, ...parseNotes(bars.join(' '))]);
  const themeA = tune('theme', THEME, LEAD);
  const themeB = tune('theme, bright', THEME, BRIGHT);
  const majorA = tune('A major', A_MAJOR, LEAD);
  const majorB = tune('A major, bright', A_MAJOR, BRIGHT);
  const cA = tune('C major', C_MAJOR, LEAD);
  const cB = tune('C major, bright', C_MAJOR, BRIGHT);

  // Oom-pah bass for one bar over a root of A2 (33): root, fifth, root, third an octave up.
  // The order-list transpose moves it to the chord root. Minor and major chords differ in the third.
  const A2 = parseNoteName('A2');
  const oompah = (name, third) => add(name, [
    { type: 'inst', instrument: PLUCK },
    { type: 'note', pitch: A2, length: 2 }, { type: 'note', pitch: A2 + 7, length: 2 },
    { type: 'note', pitch: A2, length: 2 }, { type: 'note', pitch: A2 + 12 + third, length: 2 },
  ]);
  const bassMinor = oompah('oom-pah minor', 3);
  const bassMajor = oompah('oom-pah major', 4);

  // Drums, one bar each (8 ticks): K = kick, H = hat, S = snare, C = crash.
  const hit = (instrument, name, length) => [{ type: 'inst', instrument }, ...parseNotes(`${name}:${length}`)];
  const K = (n) => hit(KICK, 'C3', n);
  const H = (n) => hit(HAT, 'B7', n);
  const S = (n) => hit(SNARE, 'A4', n);
  const C = (n) => hit(CRASH, 'B7', n);
  const march = add('march', [...K(2), ...H(1), ...H(1), ...S(2), ...H(1), ...S(1)]);
  const fill = add('march fill', [...K(2), ...H(1), ...H(1), ...S(1), ...S(1), ...S(1), ...S(1)]);
  const start = add('march start', [...C(2), ...H(1), ...H(1), ...S(2), ...H(1), ...S(1)]);

  // Sections: which tune pattern, the chord roots as transposes of the A2 bass, minor or major bass.
  const MINOR = [bassMinor, bassMinor, bassMajor, bassMinor, bassMinor, bassMajor, bassMajor, bassMinor];
  const MAJOR = Array(8).fill(bassMajor);
  const sections = [
    { tune: themeA, bass: MINOR, roots: [0, 0, -5, 0, 0, -5, -5, 0] },         // Am Am E Am Am E E Am
    { tune: themeB, bass: MINOR, roots: [0, 0, -5, 0, 0, -5, -5, 0] },
    { tune: majorA, bass: MAJOR, roots: [0, 0, -5, 0, 0, -7, -5, 0] },         // A A E A A D E A
    { tune: majorB, bass: MAJOR, roots: [0, 0, -5, 0, 0, -7, -5, 0] },
    { tune: themeA, bass: MINOR, roots: [0, 0, -5, 0, 0, -5, -5, 0] },
    { tune: cA, bass: MAJOR, roots: [3, 3, -2, 3, 3, -4, -2, 3] },             // C C G C C F G C
    { tune: cB, bass: MAJOR, roots: [3, 3, -2, 3, 3, -4, -2, 3] },
    { tune: themeB, bass: MINOR, roots: [0, 0, -5, 0, 0, -5, -5, 0] },
  ];

  const lead = [];
  const bass = [];
  const drums = [];
  for (const section of sections) {
    lead.push({ pattern: section.tune, transpose: 0 });
    section.roots.forEach((root, bar) => {
      bass.push({ pattern: section.bass[bar], transpose: root });
      drums.push({ pattern: bar === 0 ? start : bar === 3 || bar === 7 ? fill : march, transpose: 0 });
    });
  }
  for (const list of [lead, bass, drums]) list.push({ loop: 0 });

  return { instruments, song: { name: info.title, speed: 5, patterns, orders: [lead, bass, drums] } };
}
