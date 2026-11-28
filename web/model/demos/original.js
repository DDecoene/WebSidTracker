// original.js - the original demo tune, as the Demos menu plays it: an original tune in A minor, 20 bars,
// 125 beats per minute (speed 6, 16 ticks per bar). Chords per bar: Am F C G. Voice 1 bass, voice 2 the
// chords of the intro and then the lead, voice 3 drums.
//
// It is the tune of demoProject() in ../project.js (kept there, small and unchanged, for the tests),
// worked out further:
//   - a 4-bar intro of chord stabs over a lighter beat, then the two melodies, then both again on a
//     brighter lead that bends into some notes (a legato note one semitone below);
//   - the stabs are real three-note chords: the arpeggio flicks through root, third and fifth (Am minor,
//     F, C and G major), where the old tune only had the root and the fifth;
//   - at the very end the lead dives (a falling slide) back into the start of the loop;
//   - a bigger drum fill closes the form.
// Reuse: the same bass and chord patterns are played on every chord by changing only the order-list
// transpose; the whole tune loops.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'original',
  title: 'Original demo tune',
  composer: 'WebSidTracker',
  note: 'A 20-bar tune in A minor: an intro of arpeggio chords, two melodies on a sweeping pulse lead, then both again on a brighter lead with bends and a final dive, over a pulse bass and drums on their own voice.',
};

export function build() {
  const n = (name) => parseNoteName(name);
  const note = (name, length) => ({ type: 'note', pitch: n(name), length });
  const pitch = (p, length) => ({ type: 'note', pitch: p, length });
  const rest = (length) => ({ type: 'rest', length });
  const inst = (instrument) => ({ type: 'inst', instrument });
  const legato = { type: 'legato' };
  const hit = (instrument, name, length) => [inst(instrument), note(name, length)];
  const base = defaultInstrument();

  const instruments = [
    { // 0 bass: pulse that sweeps, short and punchy
      ...base, name: 'Bass', wave: 0x40, ad: 0x08, sr: 0xA0, pw: 0x0800,
      pwStep: 14, pwMin: 0x30, pwMax: 0xD0, release: 2,
    },
    { // 1 lead: pulse with a wide sweep, a soft attack, vibrato that starts late
      ...base, name: 'Lead', wave: 0x40, ad: 0x28, sr: 0xA0, pw: 0x0600,
      pwStep: 10, pwMin: 0x30, pwMax: 0xC0, vibDelay: 10, vibDepth: 6, vibSpeed: 4, release: 2,
    },
    { // 2 kick: one frame of noise, then a triangle that falls fast
      ...base, name: 'Kick', wave: 0x10, ad: 0x05, sr: 0x00, pw: 0x0800, drumNoise: 1, drumFall: 160, release: 2,
    },
    { // 3 snare: a few frames of noise, then a pulse body that falls
      ...base, name: 'Snare', wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0400, drumNoise: 3, drumFall: 120, release: 2,
    },
    { // 4 hat: noise only, very short
      ...base, name: 'Hat', wave: 0x80, ad: 0x02, sr: 0x00, drumNoise: 255, drumFall: 0, release: 2,
    },
    { // 5 minor chord: the pulse flicks through the note, a minor third and a fifth above, one per frame
      ...base, name: 'Chord minor', wave: 0x40, ad: 0x09, sr: 0x90, pw: 0x0400,
      pwStep: 6, pwMin: 0x20, pwMax: 0xC0, arp: 3, arp2: 7, release: 2,
    },
    { // 6 major chord: the same with a major third
      ...base, name: 'Chord major', wave: 0x40, ad: 0x09, sr: 0x90, pw: 0x0400,
      pwStep: 6, pwMin: 0x20, pwMax: 0xC0, arp: 4, arp2: 7, release: 2,
    },
    { // 7 the brighter lead of the second half: a quicker, wider sweep and a deeper vibrato that comes sooner
      ...base, name: 'Lead bright', wave: 0x40, ad: 0x18, sr: 0xB0, pw: 0x0400,
      pwStep: 24, pwMin: 0x28, pwMax: 0xD0, vibDelay: 6, vibDepth: 8, vibSpeed: 4, release: 2,
    },
    { // 8 the dive at the end: the bright lead with a slide that falls from the second frame on
      ...base, name: 'Lead dive', wave: 0x40, ad: 0x08, sr: 0xB0, pw: 0x0400,
      pwStep: 24, pwMin: 0x28, pwMax: 0xD0, slide: -30, release: 2,
    },
  ];
  const BASS = 0, LEAD = 1, KICK = 2, SNARE = 3, HAT = 4, MINOR = 5, MAJOR = 6, BRIGHT = 7, DIVE = 8;

  // Bass: root note R (A-2). All patterns are 16 ticks (one bar), or 64 (four bars) for the melodies.
  const R = n('A-2');
  const stabs = (instrument) => [inst(instrument), note('A-3', 6), note('A-3', 2), note('A-3', 4), rest(2), note('A-3', 2)];
  const patterns = [
    { name: 'bass groove', events: [inst(BASS), pitch(R, 3), pitch(R, 1), pitch(R + 12, 2), pitch(R, 2), pitch(R + 7, 2), pitch(R, 2), pitch(R + 12, 2), rest(2)] },
    { name: 'bass drive', events: [inst(BASS), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R + 7, 2), pitch(R + 12, 2)] },
    { name: 'bass turnaround', events: [inst(BASS), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R, 2), pitch(R + 7, 2), pitch(R + 12, 2), pitch(R + 7, 2), pitch(R + 9, 2)] },
    { name: 'stabs minor', events: stabs(MINOR) },
    { name: 'stabs major', events: stabs(MAJOR) },
    { name: 'melody 1', events: [
      inst(LEAD),
      note('A-4', 4), note('C-5', 2), note('E-5', 6), note('D-5', 2), note('C-5', 2),                // Am
      note('C-5', 4), note('A-4', 2), note('F-4', 2), note('A-4', 4), note('C-5', 4),                // F
      note('E-5', 6), note('D-5', 2), note('C-5', 4), note('G-4', 4),                                // C
      note('G-4', 4), note('B-4', 4), note('D-5', 4), note('B-4', 2), rest(2),                       // G
    ] },
    { name: 'melody 2', events: [
      inst(LEAD),
      note('E-5', 4), note('A-5', 4), note('G-5', 2), note('E-5', 2), note('C-5', 4),                // Am
      note('F-5', 4), note('E-5', 2), note('C-5', 2), note('A-4', 4), legato, note('C-5', 4),        // F
      note('G-5', 4), note('E-5', 4), note('C-5', 4), note('E-5', 4),                                // C
      note('D-5', 4), note('B-4', 4), note('G-4', 2), note('A-4', 2), rest(4),                       // G
    ] },
    { name: 'melody 1 bright', events: [
      inst(BRIGHT),
      note('A-4', 4), note('C-5', 2), note('D#5', 1), legato, note('E-5', 5), note('D-5', 2), note('C-5', 2),   // Am, bending up into the E
      note('C-5', 4), note('A-4', 2), note('F-4', 2), note('A-4', 4), note('C-5', 4),                          // F
      note('D#5', 1), legato, note('E-5', 5), note('D-5', 2), note('C-5', 4), note('G-4', 4),                  // C
      note('G-4', 4), note('B-4', 4), note('C#5', 1), legato, note('D-5', 3), note('B-4', 2), rest(2),         // G
    ] },
    { name: 'melody 2 bright', events: [
      inst(BRIGHT),
      note('E-5', 4), note('G#5', 1), legato, note('A-5', 3), note('G-5', 2), note('E-5', 2), note('C-5', 4),  // Am
      note('F-5', 4), note('E-5', 2), note('C-5', 2), note('A-4', 4), legato, note('C-5', 4),                  // F
      note('G-5', 4), note('E-5', 4), note('C-5', 4), note('E-5', 4),                                          // C
      note('D-5', 4), note('B-4', 4), note('G-4', 2), note('A-4', 2), inst(DIVE), note('E-5', 4),              // G, and the dive
    ] },
    { name: 'beat', events: [
      ...hit(KICK, 'C-3', 2), ...hit(HAT, 'C-6', 2), ...hit(SNARE, 'D-4', 2), ...hit(HAT, 'C-6', 2),
      ...hit(KICK, 'C-3', 2), ...hit(KICK, 'C-3', 2), ...hit(SNARE, 'D-4', 2), ...hit(HAT, 'C-6', 2),
    ] },
    { name: 'fill', events: [
      ...hit(KICK, 'C-3', 2), ...hit(HAT, 'C-6', 2), ...hit(SNARE, 'D-4', 2), ...hit(HAT, 'C-6', 2),
      ...hit(KICK, 'C-3', 2), ...hit(HAT, 'C-6', 2), ...hit(SNARE, 'D-4', 1), ...hit(SNARE, 'D-4', 1),
      ...hit(SNARE, 'D-4', 1), ...hit(SNARE, 'D-4', 1),
    ] },
    { name: 'intro beat', events: [
      ...hit(KICK, 'C-3', 2), ...hit(HAT, 'C-6', 2), ...hit(HAT, 'C-6', 2), ...hit(HAT, 'C-6', 2),
      ...hit(KICK, 'C-3', 2), ...hit(HAT, 'C-6', 2), ...hit(HAT, 'C-6', 2), ...hit(HAT, 'C-6', 2),
    ] },
    { name: 'big fill', events: [
      ...hit(KICK, 'C-3', 2), ...hit(SNARE, 'E-4', 1), ...hit(SNARE, 'E-4', 1), ...hit(SNARE, 'D-4', 1), ...hit(SNARE, 'D-4', 1),
      ...hit(SNARE, 'C-4', 1), ...hit(SNARE, 'C-4', 1), ...hit(KICK, 'C-3', 2), ...hit(SNARE, 'A#3', 1), ...hit(SNARE, 'A#3', 1),
      ...hit(SNARE, 'A-3', 1), ...hit(SNARE, 'A-3', 1), ...hit(KICK, 'C-3', 1), ...hit(KICK, 'C-3', 1),
    ] },
  ];
  const [GROOVE, DRIVE, TURN, STABS_MINOR, STABS_MAJOR, MEL1, MEL2, MEL1B, MEL2B, BEAT, FILL, INTRO_BEAT, BIG_FILL] =
    patterns.map((_, i) => i);

  // Transposes for the chords Am, F, C, G relative to the A patterns.
  const CHORDS = [0, -4, 3, -2];
  const entry = (pattern, transpose = 0) => ({ pattern, transpose });
  const progression = (pattern, last = pattern) => CHORDS.map((t, i) => entry(i === 3 ? last : pattern, t));

  const bass = [
    ...progression(GROOVE, TURN),                                   // bars 1-4: intro
    ...progression(GROOVE), ...progression(DRIVE, TURN),            // bars 5-12: melody 1, melody 2
    ...progression(GROOVE), ...progression(DRIVE, TURN),            // bars 13-20: both again, bright
    { loop: 0 },
  ];
  const lead = [
    entry(STABS_MINOR), entry(STABS_MAJOR, -4), entry(STABS_MAJOR, 3), entry(STABS_MAJOR, -2),   // Am F C G
    entry(MEL1), entry(MEL2), entry(MEL1B), entry(MEL2B),
    { loop: 0 },
  ];
  const drums = [
    entry(INTRO_BEAT), entry(INTRO_BEAT), entry(INTRO_BEAT), entry(FILL),
    entry(BEAT), entry(BEAT), entry(BEAT), entry(FILL),
    entry(BEAT), entry(BEAT), entry(BEAT), entry(FILL),
    entry(BEAT), entry(BEAT), entry(BEAT), entry(FILL),
    entry(BEAT), entry(BEAT), entry(FILL), entry(BIG_FILL),
    { loop: 0 },
  ];

  return { instruments, song: { name: 'demo', speed: 6, patterns, orders: [bass, lead, drums] }, effects: [] };
}
