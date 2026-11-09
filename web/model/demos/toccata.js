// toccata.js - an arrangement of the opening of J. S. Bach's Toccata in D minor (BWV 565)
// for the three SID voices. The composition is public domain; this arrangement is original.
//
// Layout of the arrangement (speed 3 = 60 ms per tick, one tick is a thirty-second note):
//   1. the opening: the mordent on A, the falling G-F-E-D-C#-D, first high (voices 1 and 2 in
//      octaves), then an octave lower with the pedal voice joining in
//   2. three rapid falling runs through diminished-seventh notes, each ending in the chord
//      that the three voices (the arpeggio instrument fills in the fourth note) sustain
//   3. a dramatic pause, then the low D in three octaves
//   4. sixteen bars of running sixteenths over a pedal bass with arpeggio chords; the second
//      eight bars add a light beat on the pedal voice
//   5. a rising D major arpeggio and a long final chord
//
// Notes are written as text: "A5:1" = note A5, 1 tick long; "r:8" = rest of 8 ticks;
// "i2" = switch to instrument 2; "l" = legato marker. Octaves follow noteName(): A4 = 440 Hz.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'toccata',
  title: 'Toccata in D minor',
  composer: 'J. S. Bach (public domain), arranged for SID',
  note: 'The famous opening in octaves, falling diminished-seventh runs and the low D pedal, then running sixteenths over arpeggio chords with a light beat in the second half.',
};

const SPEED = 3;

// Instrument numbers.
const LEAD = 0, LOW = 1, PEDAL = 2, ARP_M3 = 3, ARP_4 = 4, ARP_TRITONE = 5, KICK = 6, SNARE = 7, HAT = 8;

function instruments() {
  const base = defaultInstrument();
  const arp = (name, semitones) => ({
    ...base, name, wave: 0x40, ad: 0x10, sr: 0xC0, pw: 0x0400, pwStep: 3, pwMin: 0x20, pwMax: 0xE0, arp: semitones, release: 1,
  });
  const list = [];
  list[LEAD] = { // organ-like pulse; the vibrato starts only after a long note has been held for a while
    ...base, name: 'Organ lead', wave: 0x40, ad: 0x10, sr: 0xF0, pw: 0x0800, pwStep: 4, pwMin: 0x30, pwMax: 0xD0,
    vibDelay: 14, vibDepth: 5, vibSpeed: 6, release: 1,
  };
  list[LOW] = { // the octave doubling, narrower pulse so it adds body without hiding the lead
    ...base, name: 'Organ low', wave: 0x40, ad: 0x10, sr: 0xF0, pw: 0x0500, pwStep: 5, pwMin: 0x20, pwMax: 0xC0, release: 1,
  };
  list[PEDAL] = { // sweeping pulse bass
    ...base, name: 'Pedal', wave: 0x40, ad: 0x00, sr: 0xF0, pw: 0x0800, pwStep: 10, pwMin: 0x28, pwMax: 0xD8, release: 1,
  };
  list[ARP_M3] = arp('Arp +3', 3);
  list[ARP_4] = arp('Arp +4', 4);
  list[ARP_TRITONE] = arp('Arp +6', 6);
  list[KICK] = { ...base, name: 'Kick', wave: 0x10, ad: 0x05, sr: 0x00, drumNoise: 1, drumFall: 160, release: 2 };
  list[SNARE] = { ...base, name: 'Snare', wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0400, drumNoise: 3, drumFall: 120, release: 2 };
  list[HAT] = { ...base, name: 'Hat', wave: 0x80, ad: 0x02, sr: 0x00, drumNoise: 255, drumFall: 0, release: 1 };
  return list;
}

// "A5:1 G5:1 r:8 i2 ..." -> events. A note without ":length" gets defaultLength.
function events(text, defaultLength = 1) {
  return text.trim().split(/\s+/).map((token) => {
    if (token === 'l') return { type: 'legato' };
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, len] = token.split(':');
    const length = len === undefined ? defaultLength : Number(len);
    if (name === 'r') return { type: 'rest', length };
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`toccata: unknown note "${token}"`);
    return { type: 'note', pitch, length };
  });
}

const ticksOf = (list) => list.reduce((sum, e) => sum + (e.length || 0), 0);

// The opening, every section as one text per voice: voice 1 plays the line, voice 2 doubles it
// an octave lower, voice 3 (pedal) joins in from the second statement on.
const INTRO = [
  { // the opening: mordent on A, G-F-E-D-C#, D held (the fermatas are long notes)
    v1: 'i0 A5:1 G5:1 A5:14 G5:1 F5:1 E5:1 D5:1 C#5:2 D5:12 r:2',
    v2: 'i1 A4:1 G4:1 A4:14 G4:1 F4:1 E4:1 D4:1 C#4:2 D4:12 r:2',
    v3: 'r:36',
  },
  { // the same an octave lower, with the pedal voice a further octave down
    v1: 'i0 A4:1 G4:1 A4:14 G4:1 F4:1 E4:1 D4:1 C#4:2 D4:12 r:2',
    v2: 'i1 A3:1 G3:1 A3:14 G3:1 F3:1 E3:1 D3:1 C#3:2 D3:12 r:2',
    v3: 'i2 A2:1 G2:1 A2:14 G2:1 F2:1 E2:1 D2:1 C#2:2 D2:12 r:2',
  },
  { // run through C#-E-G-Bb, then that chord: voice 2 plays G and C# alternately, voice 3 the E
    v1: 'i0 A#5:1 G5:1 E5:1 C#5:1 A#4:1 G4:1 E4:1 C#4:1 A#4:12',
    v2: `i1 A#4:1 G4:1 E4:1 C#4:1 A#3:1 G3:1 E3:1 C#3:1 i${ARP_TRITONE} G3:12`,
    v3: 'r:8 i2 E2:12',
  },
  { // run through F#-A-C-Eb and that chord (voice 2: C and F#)
    v1: 'i0 A5:1 F#5:1 D#5:1 C5:1 A4:1 F#4:1 D#4:1 C4:1 A4:12',
    v2: `i1 A4:1 F#4:1 D#4:1 C4:1 A3:1 F#3:1 D#3:1 C3:1 i${ARP_TRITONE} C3:12`,
    v3: 'r:8 i2 D#2:12',
  },
  { // a scale falling to the chord of D minor
    v1: 'i0 D6:1 C#6:1 A#5:1 A5:1 G5:1 E5:1 C#5:1 A4:1 A4:12',
    v2: `i1 D5:1 C#5:1 A#4:1 A4:1 G4:1 E4:1 C#4:1 A3:1 i${ARP_4} F3:12`,
    v3: 'r:8 i2 D2:12',
  },
  { // the dramatic pause, then the low D in three octaves
    v1: 'r:10 i0 D4:24',
    v2: 'r:10 i1 D3:24',
    v3: 'r:10 i2 D2:24',
  },
];

// Sixteen sixteenth notes (two ticks each) per bar for the lead, in the order of the harmony.
const RUNS = [
  'D5 E5 F5 G5 A5 G5 F5 E5 D5 E5 F5 D5 A4 D5 F5 A5',          // D minor
  'G5 A5 A#5 A5 G5 F5 E5 F5 G5 A#4 D5 G5 A#5 G5 D5 A#4',      // G minor
  'A5 G5 F5 E5 D5 C#5 D5 E5 F5 E5 D5 C#5 A4 C#5 E5 A5',       // A major
  'D5 F5 A5 D6 A5 F5 D5 F5 A5 D6 C#6 D6 A5 F5 D5 A4',         // D minor
  'A#5 A5 G5 F5 D5 F5 A#5 F5 D5 A#4 D5 F5 A#5 A5 G5 F5',      // B flat major
  'A#5 G5 E5 C#5 E5 G5 A#5 G5 E5 C#5 A#4 C#5 E5 G5 A#5 C#6',  // C# diminished seventh
  'A5 E5 C#5 A4 C#5 E5 A5 G5 E5 C#5 E5 G5 A5 C#6 E6 A5',      // A major
  'D6 A5 F5 D5 F5 A5 D6 F5 E5 D5 C#5 D5 E5 F5 G5 A5',         // D minor, leading back
];

// The harmony under each bar: bass root, and the note plus arpeggio instrument for voice 2
// (the arpeggio alternates the note with the note + n semitones, giving a two-note chord shimmer).
const HARMONY = [
  { root: 'D2', chord: 'F3', arp: ARP_4 },      // D F A
  { root: 'G2', chord: 'A#3', arp: ARP_4 },     // G Bb D
  { root: 'A1', chord: 'C#4', arp: ARP_M3 },    // A C# E
  { root: 'D2', chord: 'F3', arp: ARP_4 },      // D F A
  { root: 'A#1', chord: 'D4', arp: ARP_M3 },    // Bb D F
  { root: 'C#2', chord: 'E4', arp: ARP_M3 },    // C# E G (+ Bb in the lead)
  { root: 'A1', chord: 'C#4', arp: ARP_M3 },    // A C# E
  { root: 'D2', chord: 'F3', arp: ARP_4 },      // D F A
];

// Light beat on the pedal voice: the bass note takes 6 ticks of each quarter (8 ticks), a drum the last 2.
const BEAT = [[HAT, 'C6'], [SNARE, 'D4'], [HAT, 'C6'], [SNARE, 'D4']];
function beatBar(root) {
  return BEAT.map(([drum, name]) => `i${PEDAL} ${root}:6 i${drum} ${name}:2`).join(' ');
}

export function build() {
  const patterns = [];
  const addPattern = (name, text, defaultLength) => {
    patterns.push({ name, events: events(text, defaultLength) });
    return patterns.length - 1;
  };
  const orders = [[], [], []];
  const entry = (voice, pattern) => orders[voice].push({ pattern, transpose: 0 });

  // 1-3. the opening, the runs, the pause and the low D
  INTRO.forEach((section, k) => {
    const lengths = [section.v1, section.v2, section.v3].map((text) => ticksOf(events(text)));
    if (new Set(lengths).size !== 1) throw new Error(`toccata: intro section ${k + 1} has voices of different length ${lengths}`);
    ['v1', 'v2', 'v3'].forEach((v, voice) => entry(voice, addPattern(`intro ${k + 1} voice ${voice + 1}`, section[v])));
  });

  // 4. sixteen bars. Pass 0 has the pedal alone, pass 1 adds the beat.
  const lead = RUNS.map((text, bar) => addPattern(`run ${bar + 1}`, `i${LEAD} ${text}`, 2));
  const chords = HARMONY.map((h, bar) => addPattern(`chord ${bar + 1}`, `i${h.arp} ${h.chord}:32`));
  const pedal = HARMONY.map((h, bar) => addPattern(`pedal ${bar + 1}`, `i${PEDAL} ${h.root}:32`));
  const beat = HARMONY.map((h, bar) => addPattern(`pedal and beat ${bar + 1}`, beatBar(h.root)));
  for (let pass = 0; pass < 2; pass++) {
    for (let bar = 0; bar < 8; bar++) {
      entry(0, lead[bar]);
      entry(1, chords[bar]);
      entry(2, pass === 0 ? pedal[bar] : beat[bar]);
    }
  }

  // 5. a rising arpeggio of D minor turning to D major, and the final chord
  entry(0, addPattern('ending lead', `i${LEAD} D3:1 A3:1 D4:1 F#4:1 A4:1 D5:1 F#5:1 A5:1 D6:24`));
  entry(1, addPattern('ending chord', `i${ARP_M3} F#3:32`));
  entry(2, addPattern('ending pedal', `i${PEDAL} D2:32`));

  orders.forEach((list) => list.push({ stop: true }));
  return { instruments: instruments(), song: { name: 'toccata', speed: SPEED, patterns, orders } };
}
