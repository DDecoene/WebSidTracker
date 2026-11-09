// ode-to-joy.js - the starter demo: the "Ode to Joy" theme (L. van Beethoven, public domain) in C major,
// as a march at 125 beats per minute (speed 6: a tick is 6 frames, a quarter note is 4 ticks).
//
// The arrangement is our own. It plays four rounds of the 16-bar tune and adds something each round,
// so the loop shows the instruments one after the other:
//
//   round 1  plain pulse lead + bass
//   round 2  + a chord voice (arpeggio instruments: one pulse that flips between two notes every frame)
//   round 3  + a light beat (kick in the bass voice, hat between the chord stabs) and a faster feel:
//            the lead plays the dotted "3+1" rhythm, so the notes are shorter
//   round 4  the lead one octave up, kick and snare in the bass voice, a rising countermelody (saw)
//
// Three voices are not many, so voices are shared: the bass voice also plays the kick and the snare
// (a drum is just an instrument), the chord voice also plays the hat.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  composer: 'L. van Beethoven (public domain), arranged for SID',
  note: 'A marching Ode to Joy in four rounds: lead and bass, then chords, then a light beat with a shorter-note lead, then a drum-driven finale with a rising countermelody.',
};

// ---------------------------------------------------------------- the tune, written out
// "name:ticks", bars separated by "|". A quarter note is 4 ticks, an eighth 2, a half note 8.

// bars 1-4: E E F G | G F E D | C C D E | E. D D
export const THEME_A = 'E5:4 E5:4 F5:4 G5:4 | G5:4 F5:4 E5:4 D5:4 | C5:4 C5:4 D5:4 E5:4 | E5:6 D5:2 D5:8';
// bars 5-8 (and 13-16): the same, but the last bar ends on C: D. C C
export const THEME_A2 = 'E5:4 E5:4 F5:4 G5:4 | G5:4 F5:4 E5:4 D5:4 | C5:4 C5:4 D5:4 E5:4 | D5:6 C5:2 C5:8';
// bars 9-12: D D E C | D E F E C | D E F E D | C D G (the last G is below the others)
export const THEME_B = 'D5:4 D5:4 E5:4 C5:4 | D5:4 E5:2 F5:2 E5:4 C5:4 | D5:4 E5:2 F5:2 E5:4 D5:4 | C5:4 D5:4 G4:8';

// Chords per half bar (C or G major), two letters per bar, for the 16 bars of one round.
export const CHORDS = ['CC', 'CG', 'CC', 'CG', 'CC', 'CG', 'CC', 'GC', 'GC', 'GC', 'GG', 'CG', 'CC', 'CG', 'CC', 'GC'];

const BAR = 16;   // ticks per bar

// ---------------------------------------------------------------- instruments

const [BASS, LEAD, KICK, SNARE, HAT, ARP_THIRD, ARP_FIFTH, COUNTER] = [0, 1, 2, 3, 4, 5, 6, 7];

function instruments() {
  const make = (fields) => ({ ...defaultInstrument(), ...fields });
  return [
    make({ name: 'Bass', wave: 0x40, ad: 0x08, sr: 0xA4, pw: 0x0800, pwStep: 14, pwMin: 0x30, pwMax: 0xD0, release: 2 }),
    make({ name: 'Lead', wave: 0x40, ad: 0x19, sr: 0xA8, pw: 0x0800, pwStep: 5, pwMin: 0x30, pwMax: 0xC0, vibDelay: 10, vibDepth: 6, vibSpeed: 4, release: 2 }),
    make({ name: 'Kick', wave: 0x10, ad: 0x05, sr: 0x00, drumNoise: 1, drumFall: 160, release: 2 }),
    make({ name: 'Snare', wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0400, drumNoise: 3, drumFall: 120, release: 2 }),
    make({ name: 'Hat', wave: 0x80, ad: 0x02, sr: 0x00, drumNoise: 255, drumFall: 0, release: 1 }),
    make({ name: 'Chord (third)', wave: 0x40, ad: 0x09, sr: 0xA8, pw: 0x0400, pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp: 4, release: 2 }),
    make({ name: 'Chord (fifth)', wave: 0x40, ad: 0x09, sr: 0xA8, pw: 0x0400, pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp: 7, release: 2 }),
    make({ name: 'Counter', wave: 0x20, ad: 0x19, sr: 0xA6, release: 2 }),
  ];
}

// ---------------------------------------------------------------- pattern helpers

const note = (pitch, length) => ({ type: 'note', pitch, length });
const rest = (length) => ({ type: 'rest', length });
const inst = (instrument) => ({ type: 'inst', instrument });

// "E5:4 E5:4 | ..." -> note events
function melody(text) {
  return text.split(/\s+/).filter((token) => token !== '|').map((token) => {
    const [name, length] = token.split(':');
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`bad note name ${name}`);
    return note(pitch, Number(length));
  });
}

// The shorter feel of round 3: a quarter note becomes a dotted eighth plus a sixteenth of the same
// pitch (3+1 ticks), a half note becomes 6+2; eighths and dotted quarters stay.
function marchRhythm(events) {
  return events.flatMap((ev) => {
    if (ev.length === 4) return [note(ev.pitch, 3), note(ev.pitch, 1)];
    if (ev.length === 8) return [note(ev.pitch, 6), note(ev.pitch, 2)];
    return [ev];
  });
}

const ROOT = { C: 0, G: -5 };   // semitones from C: G is a fifth below the C above it

// Bass: root and fifth, C chord root = C-3 (36).
const bassRoot = (chord) => 36 + ROOT[chord];
// Chord voice and countermelody: C chord root = C-4 (48).
const chordRoot = (chord) => 48 + ROOT[chord];
const KICK_NOTE = 36;    // C-3
const SNARE_NOTE = 50;   // D-4
const HAT_NOTE = 72;     // C-6

// One bar pattern for the chord pair `chords` (e.g. 'CG'): `half(chord)` gives the events of 8 ticks.
const bar = (chords, half) => [...chords].flatMap(half);

const bassPlain = (c) => [inst(BASS), note(bassRoot(c), 4), note(bassRoot(c) + 7, 4)];
const bassKick = (c) => [inst(KICK), note(KICK_NOTE, 2), inst(BASS), note(bassRoot(c), 2), note(bassRoot(c) + 7, 4)];
const bassDrums = (c) => [inst(KICK), note(KICK_NOTE, 2), inst(BASS), note(bassRoot(c), 2),
  inst(SNARE), note(SNARE_NOTE, 2), inst(BASS), note(bassRoot(c) + 7, 2)];

// The chord voice: the same root with the third, then with the fifth (the arpeggio flips every frame).
const chordShimmer = (c) => [inst(ARP_THIRD), note(chordRoot(c), 2), inst(ARP_FIFTH), note(chordRoot(c), 2),
  inst(ARP_THIRD), note(chordRoot(c), 2), inst(ARP_FIFTH), note(chordRoot(c), 2)];
// With the beat: a hat on the beat, a chord stab on the off-beat.
const chordStabs = (c) => [inst(HAT), note(HAT_NOTE, 2), inst(ARP_THIRD), note(chordRoot(c), 2),
  inst(HAT), note(HAT_NOTE, 2), inst(ARP_FIFTH), note(chordRoot(c), 2)];
// The countermelody: the chord rising root, third, fifth, octave (a major triad for C and for G).
const counterRise = (c) => [inst(COUNTER), note(chordRoot(c), 2), note(chordRoot(c) + 4, 2), note(chordRoot(c) + 7, 2), note(chordRoot(c) + 12, 2)];

// ---------------------------------------------------------------- the project

export function build() {
  const patterns = [];
  const add = (name, events) => { patterns.push({ name, events }); return patterns.length - 1; };
  const entry = (pattern, transpose = 0) => ({ pattern, transpose });

  // Lead: four 4-bar patterns per round, plain and with the shorter notes.
  const phrases = [melody(THEME_A), melody(THEME_A2), melody(THEME_B)];
  const leadPlain = phrases.map((events, i) => add(`lead ${'A A2 B'.split(' ')[i]}`, [inst(LEAD), ...events]));
  const leadShort = phrases.map((events, i) => add(`lead ${'A A2 B'.split(' ')[i]} short`, [inst(LEAD), ...marchRhythm(events)]));
  const round = (ids) => [ids[0], ids[1], ids[2], ids[1]];   // one round: A A2 B A2

  const lead = [
    ...round(leadPlain).map((id) => entry(id)),
    ...round(leadPlain).map((id) => entry(id)),
    ...round(leadShort).map((id) => entry(id)),
    ...round(leadPlain).map((id) => entry(id, 12)),
    { loop: 0 },
  ];

  // Bass voice: one pattern per bar type (CC, CG, GC, GG) for each style.
  const BAR_TYPES = ['CC', 'CG', 'GC', 'GG'];
  const styles = (prefix, half) => Object.fromEntries(BAR_TYPES.map((t) => [t, add(`${prefix} ${t}`, bar(t, half))]));
  const bassA = styles('bass', bassPlain);
  const bassB = styles('bass+kick', bassKick);
  const bassC = styles('bass+drums', bassDrums);
  const bassRound = (set) => CHORDS.map((t) => entry(set[t]));
  const bass = [...bassRound(bassA), ...bassRound(bassA), ...bassRound(bassB), ...bassRound(bassC), { loop: 0 }];

  // Chord voice: silent in round 1, then shimmer, then hat + stabs, then the countermelody.
  const silence = add('silence 4 bars', [rest(4 * BAR)]);
  const shimmer = styles('chords', chordShimmer);
  const stabs = styles('chords+hat', chordStabs);
  const counter = styles('counter', counterRise);
  const chordRound = (set, rise = () => 0) => CHORDS.map((t, i) => entry(set[t], rise(i)));
  const chords = [
    ...[0, 1, 2, 3].map(() => entry(silence)),
    ...chordRound(shimmer), ...chordRound(stabs),
    ...chordRound(counter, (i) => (i >= 8 ? 12 : 0)),   // the line steps up an octave from bar 9 on
    { loop: 0 },
  ];

  return {
    instruments: instruments(),
    song: { name: 'ode to joy', speed: 6, patterns, orders: [lead, bass, chords] },
  };
}
