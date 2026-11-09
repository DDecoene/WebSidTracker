// mountain-king.js - "In the Hall of the Mountain King" (Edvard Grieg, public domain) arranged for
// three SID voices. The arrangement is original work.
//
// Voice 1 = bass, voice 2 = the theme, voice 3 = chord shimmer (arpeggio) and, at the end, drums.
//
// The song speed is fixed (5 frames per tick, so one tick is 0.1 s). The tune gets faster by
// writing the same bars with shorter notes: u is the number of ticks of one eighth note.
//
//   creep    u=4  quiet triangle theme over a soft bass
//   rise     u=3  the theme an octave higher on a pulse lead, pulse bass, off-beat chord stabs
//   march    u=2  twice, the second time a tone higher
//   drive    u=2  twice, saw lead, octave bass, drums come in
//   rush     u=1  twice, a tone higher each time, as fast as this speed allows
//   finale   u=2  rising run, a long high note and a crash, a short silence, then the loop
//
// Melody and rhythm are written as text: "B3:1 C#4:1 r:4" is a note (name, length in eighths) or a
// rest. The length is multiplied by u when the pattern is built, so one string serves every tempo.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'mountain-king',
  title: 'In the Hall of the Mountain King',
  composer: 'Edvard Grieg (public domain), arranged for SID',
  note: 'The creeping theme starts quietly on a triangle and is repeated higher and faster, with chord shimmer, pulse bass and finally drums, until the finale.',
};

// ---------------------------------------------------------------- the theme, in eighth notes

// One phrase per bar (8 eighths each), in B minor. A and C climb the scale, B and D are the
// answering "dip" figures; C reaches up to the high B and D rests on the dominant (F sharp major).
export const THEME = {
  A: 'B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2',
  B: 'F4:1 C#4:1 F4:2 r:4',
  C: 'B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1',
  D: 'A#4:1 F#4:1 A#4:2 r:4',
};

const BARS = ['A', 'B', 'C', 'D'];
const isDominant = (bar) => bar === 'B' || bar === 'D';   // bars B and D sit on F sharp

// ---------------------------------------------------------------- instruments

const INST = { SOFT_BASS: 0, PULSE_BASS: 1, SOFT_LEAD: 2, LEAD: 3, BIG_LEAD: 4, ARP_MINOR: 5, ARP_MAJOR: 6, KICK: 7, SNARE: 8, HAT: 9, CRASH: 10 };

function instruments() {
  const make = (name, fields) => ({ ...defaultInstrument(), name, ...fields });
  return [
    // 0 quiet triangle bass for the opening (sustain 8 of 15)
    make('Soft bass', { wave: 0x10, ad: 0x29, sr: 0x80, release: 3 }),
    // 1 pulse bass whose width sweeps slowly, loud (sustain 15)
    make('Pulse bass', { wave: 0x40, ad: 0x08, sr: 0xF0, pw: 0x0800, pwStep: 12, pwMin: 0x30, pwMax: 0xD0, release: 3 }),
    // 2 quiet triangle lead with a late, shallow vibrato (sustain 7)
    make('Soft lead', { wave: 0x10, ad: 0x4A, sr: 0x70, vibDelay: 8, vibDepth: 5, vibSpeed: 4, release: 3 }),
    // 3 pulse lead, vibrato only on the long notes (sustain 10)
    make('Lead', { wave: 0x40, ad: 0x2A, sr: 0xA8, pw: 0x0600, pwStep: 5, pwMin: 0x30, pwMax: 0xC0, vibDelay: 10, vibDepth: 6, vibSpeed: 4, release: 3 }),
    // 4 saw lead for the loud part (sustain 15)
    make('Big lead', { wave: 0x20, ad: 0x09, sr: 0xF9, vibDelay: 8, vibDepth: 5, vibSpeed: 4, release: 3 }),
    // 5, 6 chord shimmer: the note and its minor third, or major third, on alternate frames
    make('Arp minor', { wave: 0x40, ad: 0x09, sr: 0x98, pw: 0x0400, pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp: 3, release: 3 }),
    make('Arp major', { wave: 0x40, ad: 0x09, sr: 0x98, pw: 0x0400, pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp: 4, release: 3 }),
    // 7 kick: one frame of noise, then a triangle that falls fast
    make('Kick', { wave: 0x10, ad: 0x05, sr: 0xF0, drumNoise: 1, drumFall: 160, release: 2 }),
    // 8 snare: a few frames of noise, then a pulse body that falls
    make('Snare', { wave: 0x40, ad: 0x04, sr: 0xF0, pw: 0x0400, drumNoise: 3, drumFall: 120, release: 2 }),
    // 9 hat: noise only, very short
    make('Hat', { wave: 0x80, ad: 0x02, sr: 0xC0, drumNoise: 255, drumFall: 0, release: 1 }),
    // 10 crash: noise with a long decay
    make('Crash', { wave: 0x80, ad: 0x0B, sr: 0x00, drumNoise: 255, drumFall: 0, release: 3 }),
  ];
}

// Drum letters used in the drum strings: instrument and the pitch that goes with it.
const DRUMS = {
  K: { inst: INST.KICK, note: 'C3' },
  S: { inst: INST.SNARE, note: 'D4' },
  H: { inst: INST.HAT, note: 'C6' },
  C: { inst: INST.CRASH, note: 'D4' },
};

// ---------------------------------------------------------------- text to events

// "B3:1 r:2 K:1" -> events. Lengths are in units of `unit` ticks (the result must be a whole number).
// `inst` is put first, so a pattern never depends on what the voice played before it.
export function parseNotes(text, unit, inst) {
  const events = [{ type: 'inst', instrument: inst }];
  let current = inst;
  for (const token of text.trim().split(/\s+/)) {
    const [name, units] = token.split(':');
    const length = Number(units) * unit;
    if (!Number.isInteger(length) || length < 1) throw new Error(`bad length in "${token}" for unit ${unit}`);
    if (name === 'r') { events.push({ type: 'rest', length }); continue; }
    const drum = DRUMS[name];
    if (drum && drum.inst !== current) { events.push({ type: 'inst', instrument: drum.inst }); current = drum.inst; }
    const pitch = parseNoteName(drum ? drum.note : name);
    if (pitch === null) throw new Error(`bad note name in "${token}"`);
    events.push({ type: 'note', pitch, length });
  }
  return events;
}

// ---------------------------------------------------------------- the arrangement

// Bass, one bar in eighths, root B (the order list moves it to F sharp on the dominant bars).
const BASS = {
  soft: 'B2:2 r:2 F#3:2 r:2',
  walk: 'B2:1 B2:1 B3:1 B2:1 F#3:1 B2:1 B3:1 B2:1',
  octave: 'B2:1 B3:1 B2:1 B3:1 B2:1 B3:1 B2:1 B3:1',
};

// Chord shimmer on voice 3, one bar in eighths. Root B on the tonic bars, F sharp on the dominant bars.
const CHORD = {
  stab: (root) => `r:1 ${root}:1 r:1 ${root}:1 r:1 ${root}:1 r:1 ${root}:1`,
  hold: (root) => `${root}:3 r:1 ${root}:3 r:1`,
};

// Drums, one bar in eighths.
const BEAT = 'K:1 H:1 S:1 H:1 K:1 K:1 S:1 H:1';
const FILL = 'K:1 H:1 S:1 H:1 K:1 S:1 S:1 S:1';

// Each section: u (ticks per eighth), key (semitones above B minor), the lead (instrument, octave
// shift), the bass style and what voice 3 does.
const SECTIONS = [
  { u: 4, key: 0, lead: [INST.SOFT_LEAD, 0], bass: [INST.SOFT_BASS, 'soft'], third: 'rest' },
  { u: 3, key: 0, lead: [INST.LEAD, 12], bass: [INST.PULSE_BASS, 'walk'], third: 'stab' },
  { u: 2, key: 0, lead: [INST.LEAD, 12], bass: [INST.PULSE_BASS, 'walk'], third: 'hold' },
  { u: 2, key: 2, lead: [INST.LEAD, 12], bass: [INST.PULSE_BASS, 'walk'], third: 'hold' },
  { u: 2, key: 2, lead: [INST.BIG_LEAD, 12], bass: [INST.PULSE_BASS, 'octave'], third: 'drums' },
  { u: 2, key: 4, lead: [INST.BIG_LEAD, 12], bass: [INST.PULSE_BASS, 'octave'], third: 'drums' },
  { u: 1, key: 4, lead: [INST.BIG_LEAD, 12], bass: [INST.PULSE_BASS, 'octave'], third: 'drums' },
  { u: 1, key: 6, lead: [INST.BIG_LEAD, 12], bass: [INST.PULSE_BASS, 'octave'], third: 'drums' },
];

const FINALE_U = 2;
const GAP_TICKS = 20;   // two seconds of silence before the loop

export function build() {
  const patterns = [];
  const index = new Map();
  // Adds a pattern once; the same name always gives the same pattern number.
  const pattern = (name, make) => {
    if (!index.has(name)) { index.set(name, patterns.length); patterns.push({ name, events: make() }); }
    return index.get(name);
  };
  const entry = (n, transpose = 0) => ({ pattern: n, transpose });

  const orders = [[], [], []];
  for (const s of SECTIONS) {
    const barTicks = 8 * s.u;
    for (const bar of BARS) {
      const dominant = isDominant(bar);
      // voice 1: the bass pattern is written on B; the dominant bars move it down to F sharp
      const [bassInst, bassStyle] = s.bass;
      orders[0].push(entry(pattern(`bass ${bassStyle} u${s.u}`, () => parseNotes(BASS[bassStyle], s.u, bassInst)), s.key + (dominant ? -5 : 0)));
      // voice 2: the theme
      const [leadInst, shift] = s.lead;
      orders[1].push(entry(pattern(`theme ${bar} u${s.u} i${leadInst}`, () => parseNotes(THEME[bar], s.u, leadInst)), s.key + shift));
      // voice 3: silence, chord shimmer or drums
      if (s.third === 'rest') {
        orders[2].push(entry(pattern(`silence ${barTicks}`, () => [{ type: 'inst', instrument: 0 }, { type: 'rest', length: barTicks }])));
      } else if (s.third === 'drums') {
        const text = bar === 'D' ? FILL : BEAT;
        orders[2].push(entry(pattern(`drums ${bar === 'D' ? 'fill' : 'beat'} u${s.u}`, () => parseNotes(text, s.u, INST.KICK))));
      } else {
        const inst = dominant ? INST.ARP_MAJOR : INST.ARP_MINOR;
        const root = dominant ? 'F#3' : 'B3';
        orders[2].push(entry(pattern(`chord ${s.third} ${root} u${s.u}`, () => parseNotes(CHORD[s.third](root), s.u, inst)), s.key));
      }
    }
  }

  // The finale: a rising run over a driving bass and a snare roll, then a long high note, a low
  // bass note and a crash, and a silence.
  const u = FINALE_U;
  const finale = [
    [INST.PULSE_BASS, 'B2:1 B3:1 B2:1 B3:1 B2:1 B3:1 B2:1 B3:1', 'B1:6 r:2'],
    [INST.BIG_LEAD, 'B4:1 D5:1 F#5:1 B5:1 D6:1 B5:1 F#5:1 D5:1', 'B5:6 r:2'],
    [INST.SNARE, 'S:1 S:1 S:1 S:1 S:1 S:1 S:1 S:1', 'C:6 r:2'],
  ];
  finale.forEach(([inst, run, end], voice) => {
    orders[voice].push(entry(pattern(`finale run ${voice}`, () => parseNotes(run, u, inst))));
    orders[voice].push(entry(pattern(`finale end ${voice}`, () => parseNotes(end, u, inst))));
    orders[voice].push(entry(pattern(`gap ${GAP_TICKS}`, () => [{ type: 'inst', instrument: 0 }, { type: 'rest', length: GAP_TICKS }])));
    orders[voice].push({ loop: 0 });
  });

  return { instruments: instruments(), song: { name: 'mountain king', speed: 5, patterns, orders } };
}
