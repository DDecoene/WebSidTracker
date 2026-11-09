// project.js - the song model: constructors, limits, validation, the demo tune.
//
// A project is plain data (see the shapes in the comments below). Everything the
// editor changes lives here; bytes are made from it by serialise.js.
//
//   project    = { instruments: Instrument[], song: Song }
//   Instrument = { name, wave, ad, sr, pw, pwStep, pwMin, pwMax, vibDelay, vibDepth, vibSpeed,
//                  arp, drumNoise, drumFall, release }          (unused slot = null)
//   Song       = { name, speed, patterns: Pattern[], orders: [Entry[], Entry[], Entry[]] }
//   Pattern    = { name, events: Event[] }
//   Event      = {type:'note', pitch, length} | {type:'rest', length} | {type:'inst', instrument} | {type:'legato'}
//   Entry      = {pattern, transpose} | {stop:true} | {loop: entryIndex}
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { measureSong } from './serialise.js';

export const LIMITS = {
  maxInstruments: 256,
  maxPatterns: 254,          // pattern numbers 0..253 ($FE and $FF are not pattern numbers)
  maxPitch: 95,
  maxLength: 255,
  minSpeed: 1,
  maxSpeed: 255,
  maxTranspose: 96,
  maxEntries: 256,           // a loop target is one byte
  instrumentBase: 0x2000,    // 15 tables x 256 bytes
  songBase: 0x3000,
  songEnd: 0xC000,           // the song must end below this address
  scratchBase: 0xC000,       // note auditions
};

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// 48 -> "C-4", 54 -> "F#4"
export function noteName(pitch) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12);
}

// "C-4", "F#3" (also "C4", "f#3") -> pitch, or null when it is not a note name.
export function parseNoteName(text) {
  const m = /^([A-Ga-g])([#-]?)(\d)$/.exec(text.trim());
  if (!m) return null;
  const index = NOTE_NAMES.indexOf(m[1].toUpperCase() + (m[2] === '#' ? '#' : '-'));
  const pitch = index + 12 * Number(m[3]);
  return pitch <= LIMITS.maxPitch ? pitch : null;
}

// What the player plays for a note under an order-entry transpose: shifted, then clamped to 0..95.
export function transposedPitch(pitch, transpose) {
  return Math.min(LIMITS.maxPitch, Math.max(0, pitch + transpose));
}

export function defaultInstrument() {
  return {
    name: 'New instrument', wave: 0x40, ad: 0x09, sr: 0xA4, pw: 0x0800, pwStep: 0, pwMin: 0x20, pwMax: 0xE0,
    vibDelay: 0, vibDepth: 0, vibSpeed: 0, arp: 0, drumNoise: 0, drumFall: 0, release: 2,
  };
}

// One empty pattern; voice 1 plays it once then stops, the other voices are silent.
export function defaultSong() {
  return {
    name: 'untitled',
    speed: 6,
    patterns: [{ name: '', events: [] }],
    orders: [[{ pattern: 0, transpose: 0 }, { stop: true }], [{ stop: true }], [{ stop: true }]],
  };
}

export function newProject() {
  return { instruments: [{ ...defaultInstrument(), name: 'Instrument 0' }], song: defaultSong() };
}

export function clone(project) {
  return JSON.parse(JSON.stringify(project));
}

// ---------------------------------------------------------------- validation

const INSTRUMENT_FIELDS = [
  ['wave', 0, 255], ['ad', 0, 255], ['sr', 0, 255], ['pw', 0, 4095], ['pwStep', -128, 127],
  ['pwMin', 0, 255], ['pwMax', 0, 255], ['vibDelay', 0, 255], ['vibDepth', 0, 255], ['vibSpeed', 0, 255],
  ['arp', -128, 127], ['drumNoise', 0, 255], ['drumFall', 0, 255], ['release', 0, 255],
];

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Returns an array of problem strings (empty = fine).
export function validate(project) {
  const problems = [];
  if (!project || !Array.isArray(project.instruments) || !project.song) return ['not a project'];
  const { instruments, song } = project;

  if (instruments.length > LIMITS.maxInstruments) problems.push(`more than ${LIMITS.maxInstruments} instruments`);
  instruments.forEach((inst, n) => {
    if (inst === null) return;
    if (typeof inst !== 'object') { problems.push(`instrument ${n} is not an object`); return; }
    if (typeof inst.name !== 'string') problems.push(`instrument ${n} has no name`);
    for (const [field, lo, hi] of INSTRUMENT_FIELDS) {
      if (!isInt(inst[field], lo, hi)) problems.push(`instrument ${n}: ${field} must be a whole number from ${lo} to ${hi}`);
    }
  });

  if (!isInt(song.speed, LIMITS.minSpeed, LIMITS.maxSpeed)) problems.push(`speed must be a whole number from ${LIMITS.minSpeed} to ${LIMITS.maxSpeed}`);
  if (!Array.isArray(song.patterns)) return [...problems, 'song has no pattern list'];
  if (!Array.isArray(song.orders) || song.orders.length !== 3 || !song.orders.every(Array.isArray)) return [...problems, 'song needs three order lists'];
  if (song.patterns.length > LIMITS.maxPatterns) problems.push(`more than ${LIMITS.maxPatterns} patterns`);

  song.patterns.forEach((pattern, n) => {
    if (!pattern || !Array.isArray(pattern.events)) { problems.push(`pattern ${n} has no event list`); return; }
    pattern.events.forEach((ev, i) => {
      const where = `pattern ${n} event ${i}`;
      switch (ev && ev.type) {
        case 'note':
          if (!isInt(ev.pitch, 0, LIMITS.maxPitch)) problems.push(`${where}: pitch must be 0 to ${LIMITS.maxPitch}`);
          if (!isInt(ev.length, 1, LIMITS.maxLength)) problems.push(`${where}: length must be 1 to ${LIMITS.maxLength}`);
          break;
        case 'rest':
          if (!isInt(ev.length, 1, LIMITS.maxLength)) problems.push(`${where}: length must be 1 to ${LIMITS.maxLength}`);
          break;
        case 'inst':
          if (!isInt(ev.instrument, 0, 255)) problems.push(`${where}: instrument must be 0 to 255`);
          else if (!instruments[ev.instrument]) problems.push(`${where}: instrument ${ev.instrument} does not exist`);
          break;
        case 'legato':
          break;
        default:
          problems.push(`${where}: unknown event type`);
      }
    });
  });

  const ticks = (n) => song.patterns[n].events.reduce((sum, ev) => sum + (ev.type === 'note' || ev.type === 'rest' ? ev.length : 0), 0);
  song.orders.forEach((entries, v) => {
    if (entries.length > LIMITS.maxEntries) problems.push(`voice ${v + 1}: more than ${LIMITS.maxEntries} order entries`);
    entries.forEach((entry, i) => {
      const where = `voice ${v + 1} entry ${i}`;
      if (entry && entry.stop) return;
      if (entry && entry.loop !== undefined) {
        if (!isInt(entry.loop, 0, entries.length - 1)) { problems.push(`${where}: loop target ${entry.loop} does not exist`); return; }
        // A loop that plays no ticks would make the player spin forever inside one music_play call.
        let total = 0;
        let leaves = false;
        for (let j = entry.loop; j < i && !leaves; j++) {
          const e = entries[j];
          if (e.stop || e.loop !== undefined) leaves = true;
          else if (song.patterns[e.pattern]) total += ticks(e.pattern);
        }
        if (!leaves && total === 0) problems.push(`${where}: the loop plays no notes or rests (the player would hang)`);
        return;
      }
      if (!entry || !isInt(entry.pattern, 0, 253)) problems.push(`${where}: pattern number must be 0 to 253`);
      else if (!song.patterns[entry.pattern]) problems.push(`${where}: pattern ${entry.pattern} does not exist`);
      if (entry && !isInt(entry.transpose, -LIMITS.maxTranspose, LIMITS.maxTranspose)) problems.push(`${where}: transpose must be -${LIMITS.maxTranspose} to ${LIMITS.maxTranspose}`);
    });
  });

  if (!problems.length) {
    const info = songSizeInfo(project);
    if (!info.fits) problems.push(`song is ${info.songBytes} bytes, only ${info.capacity} fit below $${LIMITS.songEnd.toString(16).toUpperCase()}`);
  }
  return problems;
}

// ---------------------------------------------------------------- sizes

export function songSizeInfo(project) {
  const layout = measureSong(project.song);
  const used = project.instruments.reduce((top, inst, n) => (inst ? n + 1 : top), 0);
  const instrumentCount = Math.max(1, used);
  const capacity = LIMITS.songEnd - LIMITS.songBase;
  const patternTableBytes = 2 * layout.patterns;
  return {
    songBytes: layout.size,
    headerBytes: 9,
    patternTableBytes,
    orderBytes: layout.patternOffsets.length ? layout.patternOffsets[0] - layout.orderOffsets[0] : layout.size - layout.orderOffsets[0],
    patternBytes: layout.patternOffsets.length ? layout.size - layout.patternOffsets[0] : 0,
    patternCount: layout.patterns,
    instrumentCount,
    instrumentBytes: 15 * instrumentCount,   // size of the trimmed instruments.asm tables
    capacity,
    free: capacity - layout.size,
    fits: layout.size <= capacity,
  };
}

// A one-voice song for note auditions: voice 1 plays `length` ticks of the note, the others are silent.
export function previewSong(instrumentIndex, pitch, speed = 4, length = 16) {
  return {
    name: 'preview',
    speed,
    patterns: [{ name: '', events: [{ type: 'inst', instrument: instrumentIndex }, { type: 'note', pitch, length }] }],
    orders: [[{ pattern: 0, transpose: 0 }, { stop: true }], [{ stop: true }], [{ stop: true }]],
  };
}

// ---------------------------------------------------------------- the demo tune

// An original tune in A minor, 16 bars, 125 beats per minute (speed 6, 16 ticks per bar).
// Chords per bar: Am F C G. Voice 1 bass, voice 2 lead, voice 3 drums.
// Reuse: the same bass and chord patterns are played on every chord by changing only the
// order-list transpose; the whole tune loops.
export function demoProject() {
  const n = (name) => parseNoteName(name);
  const note = (name, length) => ({ type: 'note', pitch: n(name), length });
  const pitch = (p, length) => ({ type: 'note', pitch: p, length });
  const rest = (length) => ({ type: 'rest', length });
  const inst = (instrument) => ({ type: 'inst', instrument });
  const hit = (instrument, name, length) => [inst(instrument), note(name, length)];

  const instruments = [
    { // 0 bass: pulse that slowly sweeps, short and punchy
      ...defaultInstrument(), name: 'Bass', wave: 0x40, ad: 0x08, sr: 0xA4, pw: 0x0800,
      pwStep: 14, pwMin: 0x30, pwMax: 0xD0, release: 2,
    },
    { // 1 lead: pulse, slower attack, vibrato that starts late
      ...defaultInstrument(), name: 'Lead', wave: 0x40, ad: 0x28, sr: 0xA6, pw: 0x0600,
      pwStep: 6, pwMin: 0x30, pwMax: 0xC0, vibDelay: 10, vibDepth: 6, vibSpeed: 3, release: 2,
    },
    { // 2 kick: one frame of noise, then a triangle that falls fast
      ...defaultInstrument(), name: 'Kick', wave: 0x10, ad: 0x05, sr: 0x00, pw: 0x0800,
      drumNoise: 1, drumFall: 160, release: 2,
    },
    { // 3 snare: a few frames of noise, then a pulse body that falls
      ...defaultInstrument(), name: 'Snare', wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0400,
      drumNoise: 3, drumFall: 120, release: 2,
    },
    { // 4 hat: noise only, very short
      ...defaultInstrument(), name: 'Hat', wave: 0x80, ad: 0x02, sr: 0x00,
      drumNoise: 255, drumFall: 0, release: 1,
    },
    { // 5 arp: pulse that jumps between the note and its fifth on every frame (a chord shimmer)
      ...defaultInstrument(), name: 'Arp', wave: 0x40, ad: 0x09, sr: 0xA8, pw: 0x0400,
      pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp: 7, release: 2,
    },
  ];
  const BASS = 0, LEAD = 1, KICK = 2, SNARE = 3, HAT = 4, ARP = 5;

  // Bass: root note R (A-2 = 33). All patterns are 16 ticks (one bar).
  const R = n('A-2');
  const patterns = [
    { name: 'bass groove', events: [inst(BASS), pitch(R, 3), pitch(R, 1), pitch(R + 12, 2), pitch(R, 2), pitch(R + 7, 2), pitch(R, 2), pitch(R + 12, 2), rest(2)] },
    { name: 'bass drive', events: [inst(BASS), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R + 7, 2), pitch(R + 12, 2)] },
    { name: 'bass turnaround', events: [inst(BASS), pitch(R, 2), pitch(R, 2), pitch(R + 12, 2), pitch(R, 2), pitch(R + 7, 2), pitch(R + 12, 2), pitch(R + 7, 2), pitch(R + 9, 2)] },
    { name: 'chord stabs', events: [inst(ARP), note('A-3', 6), note('A-3', 2), note('A-3', 4), rest(2), note('A-3', 2)] },
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
      note('F-5', 4), note('E-5', 2), note('C-5', 2), note('A-4', 4), { type: 'legato' }, note('C-5', 4), // F
      note('G-5', 4), note('E-5', 4), note('C-5', 4), note('E-5', 4),                                // C
      note('D-5', 4), note('B-4', 4), note('G-4', 2), note('A-4', 2), rest(4),                       // G
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
  ];
  const [BASS_GROOVE, BASS_DRIVE, BASS_TURN, STABS, MEL1, MEL2, BEAT, FILL] = [0, 1, 2, 3, 4, 5, 6, 7];

  // Transposes for the chords Am, F, C, G relative to the Am patterns.
  const CHORDS = [0, -4, 3, -2];
  const entry = (pattern, transpose = 0) => ({ pattern, transpose });
  const progression = (pattern, last = pattern) => CHORDS.map((t, i) => entry(i === 3 ? last : pattern, t));

  const bass = [
    ...progression(BASS_GROOVE), ...progression(BASS_GROOVE, BASS_TURN),       // bars 1-8
    ...progression(BASS_DRIVE), ...progression(BASS_DRIVE, BASS_TURN),         // bars 9-16
    { loop: 0 },
  ];
  const lead = [
    ...progression(STABS), ...progression(STABS),                              // bars 1-8: chords
    entry(MEL1), entry(MEL2),                                                  // bars 9-16: melody
    { loop: 0 },
  ];
  const drums = [];
  for (let bar = 0; bar < 16; bar++) drums.push(entry(bar % 4 === 3 ? FILL : BEAT));
  drums.push({ loop: 0 });

  return { instruments, song: { name: 'demo', speed: 6, patterns, orders: [bass, lead, drums] } };
}
