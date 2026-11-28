// pulse-drive.js - "Pulse Drive", an original tune in D minor, written for WebSidTracker to show what the
// player does: the tune a first visit starts with.
//
// 150 beats per minute: speed 5 (5 frames per tick), 16 ticks per bar, so a tick is a sixteenth note.
// 32 bars, then it loops to bar 5 (the intro plays once). The three voices are laid out the classic
// C64 way, with the drums sharing a voice with the bass:
//   1  bass and drums: the bass notes, with a kick and a snare in between them on the same voice
//   2  the lead: a pulse that sweeps, a vibrato that comes in late, bends (a legato note a semitone
//      below), a rising slide into the theme and a dive at the end
//   3  the chords: one voice playing three-note chords as an arpeggio (root, third and fifth, one per
//      frame), swelling pads in the intro and the break, rhythmic stabs in between
//
// Form, one chord per bar:
//   intro   1-4   Dm Bb C A        pads and an octave bass, the lead rises in at the end
//   A       5-12  Dm Bb C Dm | Dm Bb Gm A
//   B      13-20  Bb C Am Dm | Gm C F A        higher, the bass and stabs drive harder
//   break  21-24  Bb C Dm A        no drums: a soft triangle lead, a held bass, a snare roll into A'
//   A'     25-32  the theme again on a brighter lead with bends, and a dive back to bar 5
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'pulse-drive',
  title: 'Pulse Drive',
  composer: 'WebSidTracker',
  note: 'An original tune in D minor at 150 beats per minute, laid out the classic C64 way: bass and drums on one voice, a sweeping lead with bends, slides and a late vibrato, and three-note arpeggio chords. Intro, theme, a higher B part, a break, the theme again.',
};

export const SPEED = 5;
export const BAR = 16;          // ticks per bar
export const LOOP_BAR = 5;      // the loop goes back to here: the intro plays once

const base = defaultInstrument();
const INSTRUMENTS = [
  { // 0 bass: a pulse that sweeps, struck and falling a little
    ...base, name: 'Bass', wave: 0x40, ad: 0x08, sr: 0x90, pw: 0x0400, pwStep: 16, pwMin: 0x18, pwMax: 0xA0, release: 2,
  },
  { // 1 kick: one frame of noise, then a triangle that falls fast
    ...base, name: 'Kick', wave: 0x10, ad: 0x06, sr: 0x00, drumNoise: 1, drumFall: 160, release: 2,
  },
  { // 2 snare: three frames of noise, then a pulse body that falls
    ...base, name: 'Snare', wave: 0x40, ad: 0x06, sr: 0x00, pw: 0x0400, drumNoise: 3, drumFall: 120, release: 2,
  },
  { // 3 the held bass of the break: a slow sweep and a slight late vibrato
    ...base, name: 'Bass long', wave: 0x40, ad: 0x0A, sr: 0xA0, pw: 0x0300, pwStep: 6, pwMin: 0x18, pwMax: 0x80,
    vibDelay: 20, vibDepth: 3, vibSpeed: 6, release: 2,
  },
  { // 4 lead: a wide sweep, a little decay, the vibrato after 12 frames (only the longer notes get it)
    ...base, name: 'Lead', wave: 0x40, ad: 0x19, sr: 0xB0, pw: 0x0500, pwStep: 20, pwMin: 0x30, pwMax: 0xC0,
    vibDelay: 12, vibDepth: 6, vibSpeed: 4, release: 2,
  },
  { // 5 the brighter lead of A': a quicker, wider sweep and a deeper, sooner vibrato
    ...base, name: 'Lead bright', wave: 0x40, ad: 0x18, sr: 0xC0, pw: 0x0300, pwStep: 34, pwMin: 0x20, pwMax: 0xD0,
    vibDelay: 8, vibDepth: 8, vibSpeed: 4, release: 2,
  },
  { // 6 the lead rising in at the end of the intro: a slide up
    ...base, name: 'Lead rise', wave: 0x40, ad: 0x2A, sr: 0xB0, pw: 0x0500, pwStep: 20, pwMin: 0x30, pwMax: 0xC0,
    slide: 12, release: 2,
  },
  { // 7 the dive at the end: a slide down, back into the theme
    ...base, name: 'Lead dive', wave: 0x40, ad: 0x08, sr: 0xC0, pw: 0x0300, pwStep: 34, pwMin: 0x20, pwMax: 0xD0,
    slide: -30, release: 2,
  },
  { // 8 the soft lead of the break: a triangle that swells in, with a slow, wide vibrato
    ...base, name: 'Lead soft', wave: 0x10, ad: 0x3A, sr: 0xB0, vibDelay: 10, vibDepth: 7, vibSpeed: 6, release: 2,
  },
  { // 9 minor chord stab: the pulse flicks through root, minor third and fifth
    ...base, name: 'Chord minor', wave: 0x40, ad: 0x0A, sr: 0x60, pw: 0x0600, pwStep: -14, pwMin: 0x20, pwMax: 0xB0,
    arp: 3, arp2: 7, release: 2,
  },
  { // 10 major chord stab: root, major third and fifth
    ...base, name: 'Chord major', wave: 0x40, ad: 0x0A, sr: 0x60, pw: 0x0600, pwStep: -14, pwMin: 0x20, pwMax: 0xB0,
    arp: 4, arp2: 7, release: 2,
  },
  { // 11 minor pad: the same chord, swelling in slowly and held
    ...base, name: 'Pad minor', wave: 0x40, ad: 0x6A, sr: 0x90, pw: 0x0700, pwStep: 5, pwMin: 0x30, pwMax: 0xC0,
    arp: 3, arp2: 7, release: 2,
  },
  { // 12 major pad
    ...base, name: 'Pad major', wave: 0x40, ad: 0x6A, sr: 0x90, pw: 0x0700, pwStep: 5, pwMin: 0x30, pwMax: 0xC0,
    arp: 4, arp2: 7, release: 2,
  },
];
const [BASS, KICK, SNARE, BASS_LONG, LEAD, BRIGHT, RISE, DIVE, SOFT, CHORD_MINOR, CHORD_MAJOR, PAD_MINOR, PAD_MAJOR] =
  INSTRUMENTS.map((_, i) => i);

// The chord of every bar: the name, and its lowest note for the chord voice (the root, near middle C).
const CHORD = {
  Dm: { root: 'D-4', minor: true }, Gm: { root: 'G-3', minor: true }, Am: { root: 'A-3', minor: true },
  Bb: { root: 'A#3' }, C: { root: 'C-4' }, F: { root: 'F-3' }, A: { root: 'A-3' },
};
const BARS = [
  'Dm', 'Bb', 'C', 'A',                                   // intro
  'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'Gm', 'A',           // A
  'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'A',             // B
  'Bb', 'C', 'Dm', 'A',                                   // break
  'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'Gm', 'A',           // A'
];
const section = (bar) => (bar <= 4 ? 'intro' : bar <= 12 ? 'A' : bar <= 20 ? 'B' : bar <= 24 ? 'break' : 'A2');

// ---------------------------------------------------------------- note text

// "D5:4 l E5:2 r:2 i5" -> events: a note with its length in ticks, a rest, a legato marker, an instrument.
export function parse(text) {
  return text.trim().split(/\s+/).map((token) => {
    if (token === 'l') return { type: 'legato' };
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, length] = token.split(':');
    if (name === 'r') return { type: 'rest', length: Number(length) };
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`pulse-drive: bad note "${token}"`);
    return { type: 'note', pitch, length: Number(length) };
  });
}

// ---------------------------------------------------------------- voice 1: bass and drums

// The bass pattern of a bar, by section; r is the root (in octave 2), K a kick, S a snare.
function bassBar(bar) {
  const r = parseNoteName(CHORD[BARS[bar - 1]].root) - 24;
  const B = (offset, len) => [{ type: 'inst', instrument: BASS }, { type: 'note', pitch: r + offset, length: len }];
  const K = (len) => [{ type: 'inst', instrument: KICK }, { type: 'note', pitch: parseNoteName('E-3'), length: len }];
  const S = (len) => [{ type: 'inst', instrument: SNARE }, { type: 'note', pitch: parseNoteName('D-4'), length: len }];
  const end = BARS[bar - 1] === 'A' && bar !== 4 && bar !== 24;        // the last bar of a phrase gets a fill
  switch (section(bar)) {
    case 'intro':                                                         // octaves, no drums yet
      return [0, 12, 0, 12, 0, 12, 0, 12].flatMap((o) => B(o, 2));
    case 'break':
      if (bar === 24) return [...B(0, 8), ...S(2), ...S(2), ...S(1), ...S(1), ...S(1), ...S(1)];   // a roll into A'
      return [{ type: 'inst', instrument: BASS_LONG }, { type: 'note', pitch: r, length: 12 }, { type: 'note', pitch: r + 7, length: 4 }];
    case 'B':
      if (end) return [...K(2), ...B(0, 2), ...S(2), ...B(12, 2), ...S(1), ...S(1), ...S(1), ...S(1), ...S(2), ...S(2)];
      return [...K(2), ...B(0, 1), ...B(0, 1), ...S(2), ...B(12, 2), ...K(1), ...K(1), ...B(12, 1), ...B(0, 1), ...S(2), ...B(7, 2)];
    default:                                                              // A and A'
      if (end) return [...K(2), ...B(0, 2), ...S(2), ...B(12, 2), ...S(1), ...S(1), ...S(1), ...S(1), ...S(2), ...S(2)];
      return [...K(2), ...B(0, 2), ...S(2), ...B(12, 2), ...K(2), ...B(0, 1), ...B(0, 1), ...S(2), ...B(7, 2)];
  }
}

// ---------------------------------------------------------------- voice 2: the lead, bar by bar

const THEME = [
  'D5:4 F5:2 A5:6 G5:2 F5:2',             // Dm
  'F5:4 D5:2 A#4:6 C5:2 D5:2',            // Bb
  'E5:4 G5:2 C6:6 A#5:2 G5:2',            // C
  'A5:10 G5:2 F5:2 E5:2',                 // Dm
  'D5:4 F5:2 A5:6 G5:2 F5:2',             // Dm
  'D6:4 C6:2 A#5:6 A5:2 G5:2',            // Bb
  'A#5:4 A5:2 G5:4 F5:2 E5:2 D5:2',       // Gm
  'C#5:6 E5:2 A5:8',                      // A
];
const LEAD_BARS = [
  // intro: silent, then the lead rises in
  'r:16', 'r:16', 'r:16', `r:4 i${RISE} A4:12`,
  // A
  ...THEME.map((text, k) => (k === 0 ? `i${LEAD} ${text}` : text)),
  // B
  'F5:2 A#5:2 D6:4 C6:2 A#5:2 A5:4',      // Bb
  'G5:2 C6:2 E6:4 D6:2 C6:2 A#5:4',       // C
  'A5:6 C6:2 E6:4 C6:2 A5:2',             // Am
  'D6:12 C6:2 A5:2',                      // Dm
  'A#5:4 A5:2 G5:2 D5:4 G5:4',            // Gm
  'E5:4 G5:2 C6:6 A#5:2 G5:2',            // C
  'A5:4 C6:2 F5:4 A5:2 C6:4',             // F
  'C#6:6 B5:2 A5:4 G5:2 E5:2',            // A (G natural: A7, back to D minor)
  // break: long notes on the soft triangle
  `i${SOFT} D6:16`, 'E6:16', 'F6:12 E6:2 D6:2', 'C#6:12 r:4',
  // A': the theme on the bright lead, bending up into its high notes, and the dive at the end
  `i${BRIGHT} D5:4 F5:2 G#5:1 l A5:5 G5:2 F5:2`,
  'F5:4 D5:2 A#4:6 C5:2 D5:2',
  'E5:4 G5:2 B5:1 l C6:5 A#5:2 G5:2',
  'G#5:1 l A5:9 G5:2 F5:2 E5:2',
  'D5:4 F5:2 G#5:1 l A5:5 G5:2 F5:2',
  'C#6:1 l D6:3 C6:2 A#5:6 A5:2 G5:2',
  'A#5:4 A5:2 G5:4 F5:2 E5:2 D5:2',
  `C#5:6 E5:2 i${DIVE} A5:8`,
];

// ---------------------------------------------------------------- voice 3: the chords

function chordBar(bar) {
  const { root, minor } = CHORD[BARS[bar - 1]];
  const pitch = parseNoteName(root);
  const play = (instrument, lengths) => [{ type: 'inst', instrument }, ...lengths.map((length) => (length < 0
    ? { type: 'rest', length: -length }
    : { type: 'note', pitch, length }))];
  switch (section(bar)) {
    case 'intro':
    case 'break':
      return play(minor ? PAD_MINOR : PAD_MAJOR, [16]);                 // a pad, swelling in
    case 'B':
      return play(minor ? CHORD_MINOR : CHORD_MAJOR, [2, 2, 2, 2, 2, 2, 2, 2]);   // driving eighths
    default:
      return play(minor ? CHORD_MINOR : CHORD_MAJOR, [4, 2, 2, -2, 2, 4]);         // stabs
  }
}

// ---------------------------------------------------------------- the project

export function build() {
  const patterns = [];
  const known = new Map();
  const add = (name, events) => {
    const key = JSON.stringify(events);
    if (!known.has(key)) { known.set(key, patterns.length); patterns.push({ name, events }); }
    return known.get(key);
  };
  const bars = BARS.map((_, i) => i + 1);
  // The lead's instrument carries over from bar to bar in the text above; every pattern names it again,
  // so that a pattern played on its own (or edited) sounds the same.
  let leadInstrument = LEAD;
  const leadEvents = LEAD_BARS.map((text) => {
    const events = parse(text);
    const out = events[0]?.type === 'inst' ? events : [{ type: 'inst', instrument: leadInstrument }, ...events];
    for (const ev of events) if (ev.type === 'inst') leadInstrument = ev.instrument;
    return out;
  });
  const orders = [
    bars.map((bar) => ({ pattern: add(`bass ${section(bar)} ${BARS[bar - 1]}`, bassBar(bar)), transpose: 0 })),
    bars.map((bar) => ({ pattern: add(`lead bar ${bar}`, leadEvents[bar - 1]), transpose: 0 })),
    bars.map((bar) => ({ pattern: add(`chords ${section(bar)} ${BARS[bar - 1]}`, chordBar(bar)), transpose: 0 })),
  ].map((order) => [...order, { loop: LOOP_BAR - 1 }]);
  return {
    instruments: INSTRUMENTS.map((inst) => ({ ...inst })),
    song: { name: 'Pulse Drive', speed: SPEED, patterns, orders },
    effects: [],
  };
}
