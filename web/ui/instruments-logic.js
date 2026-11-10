// instruments-logic.js - the pure part of the instrument editor.
//
// Value conversions (SID time tables, pulse width as a percentage, vibrato in
// cents), the presets, field limits, and small helpers for the instrument
// list. No DOM in here, so it can be tested in Node.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

// ---------------------------------------------------------------------------
// SID envelope times
// ---------------------------------------------------------------------------

// Time of one envelope setting 0..15, in milliseconds, from the 6581/8580
// datasheet. Attack is the time from zero to full volume. Decay and release
// are the time to fall from full volume to zero (the real fall from the
// sustain level is proportionally shorter).
export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
export const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
export const RELEASE_MS = DECAY_MS;

// One PAL frame: 19656 cycles at 985248 Hz.
export const FRAME_MS = 19656 / 985.248;

// 5 ms -> "5 ms", 1500 -> "1.5 s", 3000 -> "3 s".
export function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

export function framesToMs(frames) {
  return frames * FRAME_MS;
}

// The four nibbles of the two envelope registers.
export const attackOf = (ad) => (ad >> 4) & 15;
export const decayOf = (ad) => ad & 15;
export const sustainOf = (sr) => (sr >> 4) & 15;
export const releaseOf = (sr) => sr & 15;
export const withAttack = (ad, n) => ((n & 15) << 4) | (ad & 15);
export const withDecay = (ad, n) => (ad & 0xf0) | (n & 15);
export const withSustain = (sr, n) => ((n & 15) << 4) | (sr & 15);
export const withRelease = (sr, n) => (sr & 0xf0) | (n & 15);

// ---------------------------------------------------------------------------
// Waveform bits (the control register without the gate bit)
// ---------------------------------------------------------------------------

export const WAVE_BITS = {
  triangle: 0x10,
  saw: 0x20,
  pulse: 0x40,
  noise: 0x80,
  sync: 0x02,
  ring: 0x04,
};

const TONE_BITS = WAVE_BITS.triangle | WAVE_BITS.saw | WAVE_BITS.pulse;

export function waveFlags(wave) {
  const flags = {};
  for (const [name, bit] of Object.entries(WAVE_BITS)) flags[name] = (wave & bit) !== 0;
  return flags;
}

// Switch one flag. Noise cannot be mixed with the other waveforms: on the SID
// that combination locks the noise generator until it is reset, and the voice
// goes silent. So turning noise on clears the others and the other way round.
// Bit 3 (test) is never set; the gate bit (0) is not part of the instrument.
export function toggleWave(wave, flag, on) {
  const bit = WAVE_BITS[flag];
  if (bit === undefined) return wave;
  let w = on ? wave | bit : wave & ~bit;
  if (on && flag === 'noise') w &= ~TONE_BITS;
  if (on && (bit & TONE_BITS)) w &= ~WAVE_BITS.noise;
  return w & 0xf6;
}

export function waveName(wave) {
  const f = waveFlags(wave);
  const names = ['triangle', 'saw', 'pulse', 'noise'].filter((n) => f[n]);
  if (f.ring) names.push('ring');
  if (f.sync) names.push('sync');
  return names.length ? names.join(' + ') : 'silent';
}

// ---------------------------------------------------------------------------
// Pulse width
// ---------------------------------------------------------------------------

// The 12-bit pulse width register: 0 = 0 %, 2048 = 50 % (square), 4095 = ~100 %.
export const pwPercent = (pw) => (pw / 4096) * 100;
export const pwFromPercent = (p) => clampInt(Math.round((p / 100) * 4096), 0, 4095);
// Sweep limits are stored in units of 16 (pulse width / 16).
export const unitsPercent = (u) => ((u * 16) / 4096) * 100;

// The pulse width over the first `frames` frames, for the little graph.
// It follows the rule in the format document: every frame `step` is added and
// the direction reverses at a limit. Start values outside the limits are
// pulled in at the first frame.
export function sweepPath(pw, step, min, max, frames) {
  const lo = Math.min(min, max) * 16;
  const hi = Math.max(min, max) * 16;
  const path = [];
  let pos = pw;
  let dir = step < 0 ? -1 : 1;
  const amount = Math.abs(step);
  for (let i = 0; i < frames; i++) {
    path.push(pos);
    if (amount === 0) continue;
    pos += dir * amount;
    if (pos >= hi) { pos = hi; dir = -1; }
    else if (pos <= lo) { pos = lo; dir = 1; }
  }
  return path;
}

// Frames for one full there-and-back sweep, or 0 when there is no sweep.
export function sweepPeriodFrames(step, min, max) {
  const amount = Math.abs(step);
  const span = Math.abs(max - min) * 16;
  if (amount === 0 || span === 0) return 0;
  return Math.round((2 * span) / amount);
}

// ---------------------------------------------------------------------------
// Vibrato
// ---------------------------------------------------------------------------

// Depth is in 1/16 of the distance to the neighbouring semitone, so 16 is a
// full semitone (100 cents) either side.
export const vibratoCents = (depth) => (depth / 16) * 100;

// Speed is frames per half period. One full wobble = 2 * speed frames.
export function vibratoHz(speed) {
  return speed > 0 ? 1000 / (2 * speed * FRAME_MS) : 0;
}

// ---------------------------------------------------------------------------
// Fields, limits, small helpers
// ---------------------------------------------------------------------------

export function clampInt(v, min, max) {
  v = Math.round(Number(v));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// Legal range of every numeric instrument field (the model's data shapes).
export const FIELD_LIMITS = {
  wave: [0, 255],
  ad: [0, 255],
  sr: [0, 255],
  pw: [0, 4095],
  pwStep: [-128, 127],
  pwMin: [0, 255],
  pwMax: [0, 255],
  vibDelay: [0, 255],
  vibDepth: [0, 255],
  vibSpeed: [0, 255],
  arp: [-96, 96],
  drumNoise: [0, 255],
  drumFall: [0, 255],
  release: [0, 255],
};

export function clampField(key, v) {
  const lim = FIELD_LIMITS[key];
  return lim ? clampInt(v, lim[0], lim[1]) : v;
}

export function hex(v, digits = 2) {
  return (v < 0 ? v + 256 : v).toString(16).toUpperCase().padStart(digits, '0');
}

// Describes what the drum fields do together, for the line under them.
export function describeDrum(inst) {
  if (!inst.drumNoise) return 'Not a drum: the note plays as a normal tone.';
  const noise = `${inst.drumNoise} frame${inst.drumNoise === 1 ? '' : 's'} of noise (${formatMs(framesToMs(inst.drumNoise))})`;
  if (!inst.drumFall) return `Drum: ${noise}, then the tone stays at the note's pitch.`;
  return `Drum: ${noise}, then the tone starts at the note's pitch and falls by ${inst.drumFall} per frame.`;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

// Every instrument field, set to a plain
// starting point: a pulse tone with a short envelope and no effects.
export function blankInstrument(name = 'New') {
  return {
    name,
    wave: WAVE_BITS.pulse,
    ad: 0x08,
    sr: 0xa0,
    pw: 0x0800,
    pwStep: 0,
    pwMin: 0x20,
    pwMax: 0xe0,
    vibDelay: 0,
    vibDepth: 0,
    vibSpeed: 0,
    arp: 0,
    drumNoise: 0,
    drumFall: 0,
    release: 2,
  };
}

// Presets are written as the fields that differ from blankInstrument().
// The drum ones assume the note is played low (kick about C-2 to C-3, snare
// about C-3 to C-4): the fall is in frequency register units per frame, so the
// same instrument falls "further" in musical terms on a low note.
export const PRESETS = [
  {
    name: 'Bass',
    hint: 'Pulse wave, instant attack, slowly sweeping pulse width for a fat sound.',
    fields: { wave: 0x40, ad: 0x08, sr: 0xa0, pw: 0x0800, pwStep: 10, pwMin: 0x30, pwMax: 0xd0 },
  },
  {
    name: 'Lead',
    hint: 'Pulse wave with a gentle sweep and a vibrato that starts a quarter second into the note.',
    fields: { wave: 0x40, ad: 0x08, sr: 0xa0, pw: 0x0800, pwStep: 6, pwMin: 0x40, pwMax: 0xc0,
      vibDelay: 12, vibDepth: 5, vibSpeed: 4 },
  },
  {
    name: 'Pad',
    hint: 'Slow attack, high sustain, vibrato that comes in late.',
    fields: { wave: 0x40, ad: 0x98, sr: 0xc0, pw: 0x0800, pwStep: 3, pwMin: 0x30, pwMax: 0xd0,
      vibDelay: 30, vibDepth: 4, vibSpeed: 5 },
  },
  {
    name: 'Pluck',
    hint: 'Pulse wave that dies away on its own: fast decay, sustain zero.',
    fields: { wave: 0x40, ad: 0x05, sr: 0x00, pw: 0x0400, pwStep: 20, pwMin: 0x20, pwMax: 0x80 },
  },
  {
    name: 'Kick',
    hint: 'One frame of noise for the click, then a triangle tone that falls fast. Play it around C-2.',
    fields: { wave: 0x10, ad: 0x06, sr: 0x00, drumNoise: 1, drumFall: 120 },
  },
  {
    name: 'Snare',
    hint: 'Three frames of noise, then a short falling pulse tone. Play it around C-3 or C-4.',
    fields: { wave: 0x40, ad: 0x04, sr: 0x00, pw: 0x0800, drumNoise: 3, drumFall: 80 },
  },
  {
    name: 'Hat',
    hint: 'Two frames of noise and a short decay. No fall; a higher note sounds brighter.',
    fields: { wave: 0x80, ad: 0x02, sr: 0x00, drumNoise: 2, drumFall: 0 },
  },
];

// A new instrument object: the blank one with a preset's fields laid over it.
// The name is kept unless it is still a "New ..." placeholder.
export function applyPreset(inst, preset) {
  const base = blankInstrument(inst.name);
  const out = { ...base, ...preset.fields };
  if (/^New\b/.test(inst.name)) out.name = preset.name;
  return out;
}

// ---------------------------------------------------------------------------
// The instrument list
// ---------------------------------------------------------------------------

export const MAX_INSTRUMENTS = 256;

// First empty slot, or the next index after the end; -1 when all 256 are used.
export function firstFreeSlot(instruments) {
  const hole = instruments.findIndex((i) => !i);
  if (hole >= 0) return hole;
  return instruments.length < MAX_INSTRUMENTS ? instruments.length : -1;
}

// Remove trailing empty slots so the exported tables stay as short as possible.
export function trimEmptySlots(instruments) {
  while (instruments.length && !instruments[instruments.length - 1]) instruments.pop();
}

// Put `inst` into `instruments` at `index` (filling gaps with null).
export function setSlot(instruments, index, inst) {
  while (instruments.length <= index) instruments.push(null);
  instruments[index] = inst;
}

export function copyName(name) {
  return /\bcopy$/.test(name) ? name : `${name} copy`;
}

// How often instrument `n` is selected inside patterns: { count, patterns }
// where `patterns` lists the pattern numbers that use it.
export function instrumentUsage(project, n) {
  const patterns = [];
  let count = 0;
  project.song.patterns.forEach((pattern, index) => {
    let here = 0;
    for (const e of pattern.events) if (e.type === 'inst' && e.instrument === n) here++;
    if (here) { count += here; patterns.push(index); }
  });
  return { count, patterns };
}

// ---------------------------------------------------------------------------
// Keyboard for auditioning
// ---------------------------------------------------------------------------

// Semitone above C of the current octave, same layout as the pattern editor:
// lower row z s x d c v g b h n j m, upper row q 2 w 3 e r 5 t 6 y 7 u.
export const PIANO_KEYS = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23,
};

// Note number (0 = C-0 .. 95) for a key press, or null if the key is no piano key.
export function pianoPitch(key, octave) {
  const offset = PIANO_KEYS[String(key).toLowerCase()];
  if (offset === undefined) return null;
  const pitch = octave * 12 + offset;
  return pitch >= 0 && pitch <= 95 ? pitch : null;
}

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const pitchName = (pitch) => `${NAMES[pitch % 12]}${Math.floor(pitch / 12)}`;
