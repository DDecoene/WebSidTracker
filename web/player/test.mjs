// test.mjs - tests for the 6502 player (src/music.asm), run in our JavaScript 6502 core.
//
// Run:  node --test web/player/test.mjs
//
// The tests load web/player/player.prg into 64 KB of RAM, write their own tiny songs and instruments
// into it (at the fixed addresses of docs/player.md), call music_init and music_play like the raster
// interrupt does, and look at the writes to the SID registers. A few tests also render audio with the
// real SID emulation and measure the pitch. Set WAV_DIR to a folder to get WAV files to listen to.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { Cpu6502 } from '../cpu/cpu6502.js';
import { createSid, MOS6581, PAL_CLOCK } from '../sid/sid.js';

const prg = readFileSync(new URL('./player.prg', import.meta.url));
const symbols = JSON.parse(readFileSync(new URL('./symbols.json', import.meta.url), 'utf8'));
const sidModule = new WebAssembly.Module(readFileSync(new URL('../sid/sid.wasm', import.meta.url)));

const FRAME_CYCLES = 19656;
const SONG = 0x3000;                    // where the tracker puts its song
const TABLE_NAMES = ['inst_wave', 'inst_ad', 'inst_sr', 'inst_pw_lo', 'inst_pw_hi', 'inst_pw_step', 'inst_pw_min',
  'inst_pw_max', 'inst_vib_delay', 'inst_vib_depth', 'inst_vib_speed', 'inst_arp', 'inst_drum_noise',
  'inst_drum_fall', 'inst_release'];

// The note names used in the tests: pitch = 12 * octave + semitone, C-0 = 0, A-4 = 57
const C3 = 36, E3 = 40, A3 = 45, C4 = 48, A4 = 57, C5 = 60;
// Pattern events
const REST = 0x60, INSTR = 0x61, LEGATO = 0x62, END = 0xFF;

// ---------------------------------------------------------------------------------------------------
// A small C64: 64 KB RAM, the player image, a 6502, and a log of the writes to the SID.
// ---------------------------------------------------------------------------------------------------
function freqOf(pitch) {
  return Math.min(65535, Math.round(440 * 2 ** ((pitch - 57) / 12) * 16777216 / PAL_CLOCK));
}

class Machine {
  constructor() {
    this.ram = new Uint8Array(65536);
    const base = prg[0] | (prg[1] << 8);
    this.ram.set(prg.subarray(2), base);
    this.sid = new Uint8Array(32);       // the last value written to each SID register
    this.log = [];                       // all writes of the current frame: { reg, value, cycle }
    this.frameStart = 0;
    this.sidListener = null;             // called for every SID write (used by the audio tests)
    this.cpu = new Cpu6502({
      read: (address) => this.ram[address],
      write: (address, value) => {
        this.ram[address] = value;
        if (address >= 0xD400 && address <= 0xD418) {
          const entry = { reg: address - 0xD400, value, cycle: this.cpu.cycles - this.frameStart };
          this.sid[entry.reg] = value;
          this.log.push(entry);
          if (this.sidListener) this.sidListener(entry);
        }
      },
    });
    this.cpu.sp = 0xFF;
    this.frames = 0;
  }

  call(name, a = 0, x = 0) {
    this.cpu.a = a;
    this.cpu.x = x;
    return this.cpu.call(symbols[name], 100000);
  }

  // Put the bytes of a song at `base` and start it.
  start(song, base = SONG) {
    this.writeBytes(base, song);
    this.call('music_init', base & 255, base >> 8);
    this.frames = 0;
  }

  writeBytes(address, bytes) {
    this.ram.set(bytes, address);
  }

  // Play one frame. Returns the cycles that music_play took; this.log has the SID writes of the frame.
  frame() {
    this.log = [];
    this.frameStart = this.cpu.cycles;
    const cycles = this.call('music_play');
    this.frames++;
    return cycles;
  }

  // Play n frames and return, per frame, the SID registers as they are at the end of the frame.
  run(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
      this.frame();
      result.push(this.voices());
    }
    return result;
  }

  // The state of the three voices, decoded from the SID registers.
  voices() {
    return [0, 1, 2].map((v) => {
      const r = v * 7;
      const s = this.sid;
      return {
        freq: s[r] | (s[r + 1] << 8),
        pw: s[r + 2] | ((s[r + 3] & 15) << 8),
        ctrl: s[r + 4],
        gate: s[r + 4] & 1,
        ad: s[r + 5],
        sr: s[r + 6],
      };
    });
  }

  // Read a state block variable (one byte). For arrays: index = the voice.
  state(name, index = 0) {
    return this.ram[symbols[name] + index];
  }
}

// The instrument tables: set one instrument from an object, with defaults that make a plain pulse note.
function setInstrument(machine, number, fields = {}) {
  const f = {
    wave: 0x40, ad: 0x00, sr: 0xF0, pw: 0x0800, pwStep: 0, pwMin: 0, pwMax: 255,
    vibDelay: 0, vibDepth: 0, vibSpeed: 0, arp: 0, drumNoise: 0, drumFall: 0, release: 2, ...fields,
  };
  const values = [f.wave, f.ad, f.sr, f.pw & 255, f.pw >> 8, f.pwStep & 255, f.pwMin, f.pwMax, f.vibDelay,
    f.vibDepth, f.vibSpeed, f.arp & 255, f.drumNoise, f.drumFall, f.release];
  TABLE_NAMES.forEach((name, i) => { machine.ram[symbols[name] + number] = values[i]; });
}

// ---------------------------------------------------------------------------------------------------
// Building songs (a tiny serialiser of our own, so these tests do not depend on the web model).
//   voices:   three order lists; entry = [pattern, transpose] | 'stop' | ['loop', entry]
//   patterns: arrays of bytes
// ---------------------------------------------------------------------------------------------------
function song({ speed = 4, voices, patterns }) {
  const out = [];
  const orderLists = [0, 1, 2].map((v) => {
    const list = [];
    for (const entry of voices[v] || ['stop']) {
      if (entry === 'stop') list.push(0xFE, 0);
      else if (entry[0] === 'loop') list.push(0xFF, entry[1]);
      else list.push(entry[0], entry[1] & 255);
    }
    return list;
  });
  // layout: header (9), order lists, pattern table, patterns
  let at = SONG + 9;
  const orderAddress = orderLists.map((list) => { const a = at; at += list.length; return a; });
  const tableAddress = at;
  at += patterns.length * 2;
  const patternAddress = patterns.map((p) => { const a = at; at += p.length; return a; });
  out.push(speed);
  for (const a of orderAddress) out.push(a & 255, a >> 8);
  out.push(tableAddress & 255, tableAddress >> 8);
  for (const list of orderLists) out.push(...list);
  for (const a of patternAddress) out.push(a & 255, a >> 8);
  for (const p of patterns) out.push(...p);
  return Uint8Array.from(out);
}

// A song with one voice playing one pattern once, then stopping.
function oneVoice(pattern, speed = 4, transpose = 0) {
  return song({ speed, voices: [[[0, transpose], 'stop']], patterns: [pattern] });
}

const gates = (frames, voice = 0) => frames.map((f) => f[voice].gate);

// ---------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------

test('symbols.json has everything the contract names', () => {
  const needed = ['music_init', 'music_play', 'music_stop', 'zp_music', 'music_size', ...TABLE_NAMES,
    'st_order_pos', 'st_pat_lo', 'st_pat_hi', 'st_pat_pos', 'st_ticks_left', 'st_instr', 'st_pitch',
    'st_transpose', 'st_speed', 'st_frame_in_tick', 'st_running'];
  for (const name of needed) assert.ok(name in symbols, `missing symbol ${name}`);
  // the instrument tables are 256 bytes each, one after the other from $2000
  TABLE_NAMES.forEach((name, k) => assert.equal(symbols[name], 0x2000 + k * 0x100, name));
  assert.equal(symbols.music_init, 0x1000);
  assert.ok(symbols.music_size <= 0x1000, 'the player must fit in 4 KB');
});

test('the frequency table has 96 notes and matches the SID formula', () => {
  const m = new Machine();
  for (let n = 0; n < 96; n++) {
    const value = m.ram[symbols.freq_lo + n] | (m.ram[symbols.freq_hi + n] << 8);
    assert.equal(value, freqOf(n), `note ${n}`);
  }
  assert.equal(m.ram[symbols.freq_lo + 57] | (m.ram[symbols.freq_hi + 57] << 8), 7493, 'A-4 = 440 Hz');
  assert.equal(m.ram[symbols.freq_hi + 95], 0xFF, 'the top note saturates');
});

test('music_init resets the state and points each voice at its first pattern', () => {
  const m = new Machine();
  m.ram.fill(0xAA, symbols.st_song_lo, symbols.music_start + symbols.music_size);   // dirty state
  const s = song({ voices: [[[0, 0], 'stop'], [[1, 5], 'stop'], null], patterns: [[C4, 1, END], [C4, 1, END]] });
  m.start(s);
  assert.equal(m.state('st_running'), 1);
  assert.equal(m.state('st_speed'), 4);
  assert.equal(m.state('st_frame_in_tick'), 0);
  for (let v = 0; v < 3; v++) {
    assert.equal(m.state('st_order_pos', v), 0);
    assert.equal(m.state('st_pat_pos', v), 0);
    assert.equal(m.state('st_ticks_left', v), 0);
    assert.equal(m.state('st_instr', v), 0);
  }
  const patternTable = s[7] | (s[8] << 8);
  const pat0 = s[patternTable - SONG] | (s[patternTable - SONG + 1] << 8);
  const pat1 = s[patternTable - SONG + 2] | (s[patternTable - SONG + 3] << 8);
  assert.equal(m.state('st_pat_lo', 0) | (m.state('st_pat_hi', 0) << 8), pat0);
  assert.equal(m.state('st_pat_lo', 1) | (m.state('st_pat_hi', 1) << 8), pat1);
  assert.equal(m.state('st_transpose', 1), 5);
  // voice 3 has an order list that stops at once
  m.frame();
  assert.equal(m.state('st_running'), 1, 'voices 1 and 2 still play');
});

test('a note: pitch, envelope, gate and the timing of the clean end (speed 4, 2 ticks, release 2)', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x29, sr: 0xB0, release: 2 });
  m.start(oneVoice([A4, 2, END], 4));
  const frames = m.run(8);
  assert.deepEqual(gates(frames), [1, 1, 1, 1, 1, 1, 0, 0], 'the gate closes for the last 2 of 8 frames');
  assert.equal(frames[0][0].freq, 7493);
  assert.equal(frames[0][0].ctrl, 0x41, 'pulse waveform + gate');
  assert.equal(frames[0][0].pw, 0x0800);
  assert.equal(frames[0][0].ad, 0x29);
  assert.equal(frames[0][0].sr, 0xB0);
  assert.equal(frames[5][0].ad, 0x29, 'the envelope is kept while the note sounds');
  assert.equal(frames[6][0].ad, 0x00, 'in the clean end, attack/decay ...');
  assert.equal(frames[6][0].sr, 0x00, '... and sustain/release are zero');
  assert.equal(frames[7][0].ctrl, 0x40, 'gate closed, waveform kept');
  assert.equal(m.state('st_running'), 1);
  m.frame();
  assert.equal(m.state('st_running'), 0, 'the order list said stop: the song is over');
  assert.deepEqual(m.voices()[0].gate, 0);
});

test('a note starts like this: test+waveform with gate low first, the envelope before the final gate write, decay = attack at first', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x29, sr: 0xB0 });
  m.start(oneVoice([A4, 2, END], 4));
  m.frame();
  const voice1 = m.log.filter((e) => e.reg < 7);
  assert.deepEqual(voice1.map((e) => e.reg), [4, 0, 1, 2, 3, 5, 6, 4, 5], 'ctrl, freq, pw, ad, sr, ctrl (gate), ad again');
  assert.equal(voice1[0].value, 0x48, 'first write: pulse + TEST, gate low');
  assert.equal(voice1[7].value, 0x41, 'the gate opens: pulse + gate');
  assert.ok(voice1[7].cycle > voice1[6].cycle);
  // the SID briefly uses the decay rate when the gate opens: before the gate AD has decay = attack ($29 -> $22) ...
  assert.equal(voice1[5].value, 0x22, 'ad before the gate: decay nibble equal to the attack nibble');
  assert.equal(voice1[6].value, 0xB0, 'sr: sustain only');
  // ... and the real AD follows right after the gate
  assert.equal(voice1[8].value, 0x29, 'the real ad after the gate');
  assert.ok(voice1[8].cycle > voice1[7].cycle);
  // between notes the voice is written in the same order, without the test write
  m.frame();
  assert.deepEqual(m.log.filter((e) => e.reg < 7).map((e) => e.reg), [0, 1, 2, 3, 5, 6, 4]);
});

test('a second note starts exactly when the first one ends', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x29 });
  m.start(oneVoice([C4, 1, C5, 1, END], 4));
  const frames = m.run(8);
  assert.deepEqual(gates(frames), [1, 1, 0, 0, 1, 1, 0, 0]);
  assert.equal(frames[0][0].freq, freqOf(C4));
  assert.equal(frames[4][0].freq, freqOf(C5));
  assert.equal(frames[3][0].ad, 0, 'the envelope is empty when the next note starts');
  assert.equal(frames[4][0].ad, 0x29);
});

test('a rest is silent, the next note starts after it', () => {
  const m = new Machine();
  m.start(oneVoice([REST, 2, C4, 1, END], 3));
  const frames = m.run(9);
  assert.deepEqual(gates(frames), [0, 0, 0, 0, 0, 0, 1, 0, 0], 'a rest of 2 ticks, then a 1-tick note (3 frames, the last 2 are the clean end)');
});

test('edge case speed 1: a 3-tick note sounds for one frame; with decay 0 a 1-tick note is one frame', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x00, release: 2 });
  m.start(oneVoice([C4, 3, C5, 1, C4, 2, END], 1));
  const frames = m.run(7);
  assert.deepEqual(gates(frames), [1, 0, 0, 1, 1, 0, 0]);
  // the 1-tick note (frame 3) has no frame left for the clean end, so it just sounds for that frame
  assert.equal(frames[3][0].freq, freqOf(C5));
  assert.equal(frames[4][0].freq, freqOf(C4));
  assert.equal(frames[0][0].freq, freqOf(C4));
});

test('with a decay above 0 a note of 1 or 2 frames keeps its gate open (a gate-off of one frame is too short for the SID)', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x06 });
  m.start(oneVoice([C4, 3, C5, 1, C4, 2, END], 1));
  const frames = m.run(7);
  assert.deepEqual(gates(frames), [1, 0, 0, 1, 1, 1, 0]);
});

test('edge case: inst_release longer than the note still sounds for the first frame', () => {
  const m = new Machine();
  setInstrument(m, 0, { release: 10 });
  m.start(oneVoice([C4, 1, C5, 2, END], 4));
  const frames = m.run(12);
  assert.deepEqual(gates(frames), [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
});

test('inst_release below 2 is played as 2 when the decay is above 0; with decay 0 only 0 is raised, to 1', () => {
  for (const release of [0, 1, 2]) {
    const m = new Machine();
    setInstrument(m, 0, { ad: 0x03, release });
    m.start(oneVoice([C4, 1, END], 4));
    assert.deepEqual(gates(m.run(4)), [1, 1, 0, 0], `decay 3, release ${release}`);
  }
  for (const [release, want] of [[0, [1, 1, 1, 0]], [1, [1, 1, 1, 0]], [2, [1, 1, 0, 0]]]) {
    const m = new Machine();
    setInstrument(m, 0, { ad: 0x30, release });
    m.start(oneVoice([C4, 1, END], 4));
    assert.deepEqual(gates(m.run(4)), want, `decay 0, release ${release}`);
  }
});

test('an instrument event switches the instrument for the following notes', () => {
  const m = new Machine();
  setInstrument(m, 0, { wave: 0x40 });
  setInstrument(m, 3, { wave: 0x20, ad: 0x55 });
  m.start(oneVoice([C4, 1, INSTR, 3, C4, 1, END], 2));
  const frames = m.run(4);
  assert.equal(frames[0][0].ctrl, 0x41);
  assert.equal(frames[2][0].ctrl, 0x21, 'sawtooth + gate');
  assert.equal(frames[2][0].ad, 0x55);
  assert.equal(m.state('st_instr', 0), 3);
});

test('order list: patterns in turn, transpose, clamping to 0..95, loop', () => {
  const m = new Machine();
  const s = song({
    speed: 1,
    voices: [[[0, 0], [0, 5], [0, -100], [0, 100], ['loop', 1]]],
    patterns: [[C4, 1, END]],
  });
  m.start(s);
  const pitches = [];
  for (let i = 0; i < 8; i++) { m.frame(); pitches.push(m.state('st_pitch', 0)); }
  // C-4 = 48; +5 = 53; -100 -> 0; +100 -> 95 (clamped); then the loop goes back to entry 1 (+5)
  assert.deepEqual(pitches, [48, 53, 0, 95, 53, 0, 95, 53]);
  assert.equal(m.state('st_order_pos', 0), 2, 'looped to entry 1');
});

test('a pattern number above 127 reaches the right entry of the pattern table (offset above 255)', () => {
  const m = new Machine();
  const patterns = [];
  for (let n = 0; n < 254; n++) patterns.push(n === 253 ? [A4, 1, END] : n === 140 ? [C5, 1, END] : [END]);
  m.start(song({ speed: 1, voices: [[[140, 0], [253, 0], 'stop']], patterns }));
  assert.deepEqual(m.run(2).map((f) => f[0].freq), [freqOf(C5), freqOf(A4)]);
});

test('the three voices share one tick clock and stay in step', () => {
  const m = new Machine();
  const loopPattern = [C4, 2, C4, 1, C4, 3, END];
  const s = song({ speed: 5, voices: [[[0, 0], ['loop', 0]], [[0, 0], ['loop', 0]], [[0, 0], ['loop', 0]]], patterns: [loopPattern] });
  m.start(s);
  for (let i = 0; i < 120; i++) {
    m.frame();
    const g = m.voices().map((v) => v.gate);
    assert.ok(g[0] === g[1] && g[1] === g[2], `frame ${i}`);
  }
});

test('when every voice has stopped, st_running is 0 and music_play does nothing', () => {
  const m = new Machine();
  m.start(oneVoice([C4, 1, END], 2));
  m.run(4);
  assert.equal(m.state('st_running'), 0);
  m.log = [];
  m.frame();
  assert.equal(m.log.length, 0, 'no SID writes after the end');
});

test('music_stop silences the SID and stops', () => {
  const m = new Machine();
  m.start(song({ voices: [[[0, 0], ['loop', 0]]], patterns: [[C4, 4, END]] }));
  m.run(3);
  m.call('music_stop');
  assert.equal(m.state('st_running'), 0);
  assert.deepEqual([...m.sid.subarray(0, 25)], new Array(25).fill(0));
  m.log = [];
  m.frame();
  assert.equal(m.log.length, 0);
});

test('a broken song (loops that go nowhere, empty patterns) does not hang the player', () => {
  const m = new Machine();
  const s = song({
    voices: [[['loop', 0]], [[0, 0], ['loop', 0]], [[1, 0], [1, 0], ['loop', 0]]],
    patterns: [[END], [END]],
  });
  m.start(s);
  const cycles = m.frame();
  assert.ok(cycles < FRAME_CYCLES, `took ${cycles} cycles`);
  assert.equal(m.state('st_running'), 0, 'all three voices were stopped');
});

test('a note read when a loop leads back stays in time (positions in the state block)', () => {
  const m = new Machine();
  m.start(song({ speed: 3, voices: [[[0, 0], ['loop', 0]]], patterns: [[C4, 2, A4, 1, END]] }));
  m.frame();
  assert.equal(m.state('st_pat_pos', 0), 2, 'the next event to read is at offset 2');
  assert.equal(m.state('st_ticks_left', 0), 2);
  m.run(3);                                   // frames 1..3: frame 3 is the second tick
  assert.equal(m.state('st_ticks_left', 0), 1);
  m.run(3);                                   // frame 6: the next note is read
  assert.equal(m.state('st_pat_pos', 0), 4);
  assert.equal(m.state('st_pitch', 0), A4);
  assert.equal(m.state('st_ticks_left', 0), 1);
  assert.equal(m.state('st_frame_in_tick'), 2);
});

test('pulse sweep: the width moves by the step every frame and turns around at the limits', () => {
  const m = new Machine();
  // start $0800, step +100, limits $0780..$0900 (units of 16: $78 and $90)
  setInstrument(m, 0, { pw: 0x0800, pwStep: 100, pwMin: 0x78, pwMax: 0x90, release: 1 });
  m.start(oneVoice([C4, 40, END], 1));
  const pw = m.run(12).map((f) => f[0].pw);
  assert.deepEqual(pw.slice(0, 4), [0x800, 0x800 + 100, 0x800 + 200, 0x900], 'up by 100, put on the max limit $900');
  assert.deepEqual(pw.slice(4, 8), [0x900 - 101, 0x900 - 202, 0x900 - 303, 0x780], 'then down by 101 (the step turned into -101), put on the min limit $780');
  assert.equal(pw[8], 0x780 + 100, 'and up again');
  assert.ok(pw.every((v) => v >= 0x780 && v <= 0x900));
});

test('pulse sweep with a negative step starts downward and has no effect when the step is 0', () => {
  const m = new Machine();
  setInstrument(m, 0, { pw: 0x0800, pwStep: -16, pwMin: 0x40, pwMax: 0xC0, release: 1 });
  setInstrument(m, 1, { pw: 0x0123, pwStep: 0 });
  m.start(song({ speed: 1, voices: [[[0, 0], 'stop'], [[1, 0], 'stop']], patterns: [[C4, 30, END], [INSTR, 1, C4, 30, END]] }));
  const frames = m.run(5);
  assert.deepEqual(frames.map((f) => f[0].pw), [0x800, 0x7F0, 0x7E0, 0x7D0, 0x7C0]);
  assert.deepEqual(frames.map((f) => f[1].pw), [0x123, 0x123, 0x123, 0x123, 0x123]);
});

test('pulse sweep: an extreme step cannot run out of the 12-bit range', () => {
  const m = new Machine();
  setInstrument(m, 0, { pw: 0x0FF0, pwStep: 120, pwMin: 0, pwMax: 255, release: 1 });
  m.start(oneVoice([C4, 60, END], 1));
  const pw = m.run(40).map((f) => f[0].pw);
  assert.ok(pw.every((v) => v >= 0 && v <= 0xFFF));
  assert.equal(pw[1], 0xFF0, 'put on the max limit');
});

// The distance from a note to the one below it, in frequency register units
const semitone = (pitch) => freqOf(pitch) - freqOf(pitch - 1);

test('vibrato starts after its delay, stays within depth/16 of a semitone and swings with the right speed', () => {
  const m = new Machine();
  // delay 6 frames, depth 8 (half a semitone), 6 frames per swing
  setInstrument(m, 0, { vibDelay: 6, vibDepth: 8, vibSpeed: 6, release: 1 });
  m.start(oneVoice([A4, 40, END], 1));
  const freq = m.run(40).map((f) => f[0].freq);
  const base = freqOf(A4);
  for (let i = 0; i <= 6; i++) assert.equal(freq[i], base, `no vibrato before/at the start (frame ${i})`);
  const offsets = freq.map((f) => f - base);
  const peak = Math.max(...offsets);
  const trough = Math.min(...offsets);
  const expected = semitone(A4) * 8 / 16;
  assert.ok(Math.abs(peak - expected) < expected * 0.1, `peak ${peak} should be about ${expected.toFixed(0)}`);
  assert.ok(Math.abs(-trough - expected) < expected * 0.1, `trough ${trough} should be about -${expected.toFixed(0)}`);
  // one swing (peak to trough) takes 6 frames: count the frames between the positive and negative peaks
  const peaks = [];
  for (let i = 8; i < 38; i++) if (offsets[i] >= offsets[i - 1] && offsets[i] > offsets[i + 1] && offsets[i] > expected * 0.8) peaks.push(i);
  const troughs = [];
  for (let i = 8; i < 38; i++) if (offsets[i] <= offsets[i - 1] && offsets[i] < offsets[i + 1] && offsets[i] < -expected * 0.8) troughs.push(i);
  assert.ok(peaks.length >= 2 && troughs.length >= 2);
  assert.equal(peaks[1] - peaks[0], 12, 'a full period is two swings = 12 frames');
  assert.equal(troughs[1] - troughs[0], 12);
  assert.equal(Math.abs(troughs[0] - peaks[0]), 6, 'peak to trough = one swing = 6 frames');
  // the offset is symmetrical around the note: the mean over whole periods is (nearly) 0
  const mean = offsets.slice(10, 34).reduce((a, b) => a + b, 0) / 24;     // two whole periods
  assert.ok(Math.abs(mean) < expected * 0.05, `mean offset ${mean}`);
});

test('vibrato is a fraction of the neighbouring semitone: equally wide in bass and treble', () => {
  const m = new Machine();
  setInstrument(m, 0, { vibDelay: 0, vibDepth: 8, vibSpeed: 8, release: 1 });
  m.start(song({ speed: 1, voices: [[[0, 0], 'stop'], [[1, 0], 'stop']], patterns: [[C3, 60, END], [C3 + 36, 60, END]] }));
  const frames = m.run(40);
  const width = (v, pitch) => {
    const base = freqOf(pitch);
    const offs = frames.map((f) => f[v].freq - base);
    return (Math.max(...offs) - Math.min(...offs)) / semitone(pitch);
  };
  const low = width(0, C3);
  const high = width(1, C3 + 36);
  assert.ok(Math.abs(low - 1) < 0.1, `low note: width ${low.toFixed(3)} semitones (expect 1: +-0.5)`);
  assert.ok(Math.abs(high - 1) < 0.1, `high note: width ${high.toFixed(3)} semitones`);
});

test('vibrato: an odd speed is rounded down to an even one, depth above 127 counts as 127', () => {
  const run = (fields) => {
    const m = new Machine();
    setInstrument(m, 0, { vibDelay: 0, release: 1, ...fields });
    m.start(oneVoice([A4, 60, END], 1));
    return m.run(40).map((f) => f[0].freq);
  };
  assert.deepEqual(run({ vibDepth: 8, vibSpeed: 5 }), run({ vibDepth: 8, vibSpeed: 4 }));
  assert.deepEqual(run({ vibDepth: 8, vibSpeed: 1 }), run({ vibDepth: 8, vibSpeed: 2 }));
  assert.deepEqual(run({ vibDepth: 255, vibSpeed: 6 }), run({ vibDepth: 127, vibSpeed: 6 }));
  const freq = run({ vibDepth: 8, vibSpeed: 5 });
  assert.equal(Math.max(...freq) - freqOf(A4), freqOf(A4) - Math.min(...freq), 'symmetrical around the note');
});

test('vibrato does not wrap around at the top of the frequency range', () => {
  const m = new Machine();
  setInstrument(m, 0, { vibDepth: 100, vibSpeed: 4, release: 1 });
  m.start(oneVoice([95, 60, END], 1));
  const freq = m.run(40).map((f) => f[0].freq);
  assert.ok(freq.every((f) => f > 40000), 'no wrap to a low frequency');
});

test('arpeggio: on every second frame the pitch is raised by the offset', () => {
  const m = new Machine();
  setInstrument(m, 0, { arp: 7, release: 1 });
  setInstrument(m, 1, { arp: -12, release: 1 });
  m.start(song({ speed: 1, voices: [[[0, 0], 'stop'], [[1, 0], 'stop']], patterns: [[A3, 20, END], [INSTR, 1, A3, 20, END]] }));
  const frames = m.run(6);
  const up = frames.map((f) => f[0].freq);
  const low = [freqOf(A3), freqOf(A3 + 7)];
  const first = up[0] === low[0] ? 0 : 1;
  assert.deepEqual(up, [0, 1, 2, 3, 4, 5].map((i) => low[(i + first) % 2]));
  assert.ok(up[0] !== up[1]);
  assert.deepEqual(new Set(frames.map((f) => f[1].freq)), new Set([freqOf(A3), freqOf(A3 - 12)]));
});

test('a drum: noise first, then the tone starts at the note and falls every frame', () => {
  const m = new Machine();
  setInstrument(m, 0, { wave: 0x10, drumNoise: 3, drumFall: 100, ad: 0x00, sr: 0xF0, release: 2 });
  m.start(oneVoice([C4, 8, END], 1));
  const frames = m.run(8);
  const start = freqOf(C4);
  assert.deepEqual(frames.map((f) => f[0].ctrl), [0x81, 0x81, 0x81, 0x11, 0x11, 0x11, 0x10, 0x10], 'noise for 3 frames, then triangle');
  assert.deepEqual(frames.map((f) => f[0].freq), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i < 3 ? start : start - 100 * (i - 3))));
});

test('a drum tone that has fallen to 0 stays at 0', () => {
  const m = new Machine();
  setInstrument(m, 0, { wave: 0x10, drumNoise: 1, drumFall: 255, release: 1 });
  m.start(oneVoice([C3, 30, END], 1));
  const freq = m.run(30).map((f) => f[0].freq);
  assert.equal(freq[0], freqOf(C3));
  assert.equal(freq[freq.length - 1], 0);
  assert.ok(freq.every((f, i) => i < 2 || f <= freq[i - 1]), 'never rises again');
});

test('vibrato and arpeggio do not touch a drum', () => {
  const m = new Machine();
  setInstrument(m, 0, { wave: 0x10, drumNoise: 1, drumFall: 10, vibDepth: 40, vibSpeed: 4, arp: 7, release: 1 });
  m.start(oneVoice([C4, 10, END], 1));
  const freq = m.run(6).map((f) => f[0].freq);
  assert.deepEqual(freq, [0, 1, 2, 3, 4, 5].map((i) => freqOf(C4) - 10 * Math.max(0, i - 1)));
});

test('legato: the next note only changes the pitch; no gate, no envelope, no restart', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x29, sr: 0xB0, pw: 0x0800, pwStep: 10, release: 2 });
  m.start(oneVoice([C4, 2, LEGATO, A4, 2, C5, 1, END], 2));
  const frames = [];
  for (let i = 0; i < 10; i++) {
    m.frame();
    frames.push({ ...m.voices()[0], writes: m.log.filter((e) => e.reg < 7) });
  }
  // C-4 for 4 frames without a gate-off before the legato note, A-4 for 4 frames with its clean end in the last two,
  // C-5 for 2 frames: too short for a clean end, so the gate stays open
  assert.deepEqual(frames.map((f) => f.gate), [1, 1, 1, 1, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual(frames.map((f) => f.freq), [...Array(4).fill(freqOf(C4)), ...Array(4).fill(freqOf(A4)), freqOf(C5), freqOf(C5)]);
  assert.equal(frames[3].ad, 0x29, 'the envelope registers are not touched');
  assert.equal(frames[4].pw, 0x800 + 40, 'the pulse sweep carries on, it does not restart at $800');
  assert.ok(!frames[4].writes.some((e) => e.reg === 4 && (e.value & 1) === 0), 'the legato note never writes the gate low');
  assert.equal(frames[4].writes[0].reg, 0, 'and there is no extra control write before the frequency');
});

test('legato after a rest (nothing sounds) starts a normal note', () => {
  const m = new Machine();
  m.start(oneVoice([REST, 1, LEGATO, A4, 2, END], 2));
  const frames = m.run(6);
  assert.deepEqual(gates(frames), [0, 0, 1, 1, 0, 0]);
  assert.equal(frames[2][0].freq, freqOf(A4));
});

test('the speed is read from the song header at every tick (the tracker can change it live)', () => {
  const m = new Machine();
  m.start(song({ speed: 6, voices: [[[0, 0], ['loop', 0]]], patterns: [[C4, 1, END]] }));
  m.run(3);
  m.ram[SONG] = 2;                            // speed 2 from the next tick on
  m.run(6);
  assert.equal(m.state('st_speed'), 2);
  assert.ok(m.state('st_frame_in_tick') <= 1);
});

test('the player writes only to the SID, its zero page bytes, its own area and the stack', () => {
  const m = new Machine();
  // Writes outside the SID, the state block, the zero page area and the stack would be a bug.
  const touched = new Set();
  const cpuWrite = m.cpu.write;
  m.cpu.write = (address, value) => { touched.add(address); cpuWrite(address, value); };
  setInstrument(m, 0, { vibDepth: 5, vibSpeed: 6, arp: 3, pwStep: 9, pwMin: 4, pwMax: 100 });
  m.start(song({ voices: [[[0, 0], ['loop', 0]]], patterns: [[C4, 3, LEGATO, A4, 2, REST, 1, END]] }));
  m.run(200);
  const zp = symbols.zp_music;
  for (const address of touched) {
    const ok = (address >= 0xD400 && address <= 0xD418) || (address >= zp && address < zp + 14)
      || (address >= 0x1000 && address < 0x1000 + symbols.music_size) || (address >= 0x0100 && address < 0x0200);
    assert.ok(ok, `unexpected write to $${address.toString(16)}`);
  }
});

test('edge cases of the data: length 0 counts as 1, unknown event bytes are skipped, gate/test bits of inst_wave are ignored', () => {
  const m = new Machine();
  setInstrument(m, 0, { wave: 0x4F, ad: 0x11 });                 // pulse + all of the low bits, incl. gate (1) and test (8)
  m.start(oneVoice([0x70, C4, 0, C5, 1, END], 2));               // $70 is reserved: ignored
  const frames = m.run(6);
  assert.equal(frames[0][0].freq, freqOf(C4));
  assert.equal(frames[0][0].ctrl, 0x47, 'pulse + ring + sync + gate, but no test bit');
  assert.equal(frames[2][0].freq, freqOf(C5), 'the length-0 note took one tick');
  m.ram[symbols.inst_wave] = 0x41;                               // gate in inst_wave: the rest must still be silent
  m.start(oneVoice([REST, 2, END], 2));
  assert.deepEqual(gates(m.run(4)), [0, 0, 0, 0]);
});

test('music_play works when the decimal flag is set by the caller', () => {
  const m = new Machine();
  m.start(oneVoice([C4, 1, A4, 1, END], 2));
  m.cpu.p |= 0x08;
  m.run(2);
  m.cpu.p |= 0x08;
  assert.equal(m.run(2)[1][0].freq, freqOf(A4));
});

// ---------------------------------------------------------------------------------------------------
// The demo song: the whole default set, in time and in audio
// ---------------------------------------------------------------------------------------------------

test('run time: music_play of the demo song never takes more than 1/4 of a frame', () => {
  const m = new Machine();
  m.call('music_init', SONG & 255, SONG >> 8);
  let max = 0, total = 0, maxFrame = 0;
  const frames = 3200;                           // 64 s: the demo loops several times
  for (let i = 0; i < frames; i++) {
    const c = m.frame();
    total += c;
    if (c > max) { max = c; maxFrame = i; }
  }
  console.log(`music_play, demo song, ${frames} frames: max ${max} cycles (frame ${maxFrame}), average ${(total / frames).toFixed(0)}, a frame has ${FRAME_CYCLES}`);
  assert.ok(max < FRAME_CYCLES / 4, `${max} cycles`);
});

// speed 1 and a long note: vibrato starts on all three voices in frame 3, a big pulse sweep, arpeggio on
function worstCase(release) {
  const m = new Machine();
  for (const n of [0, 1, 2]) setInstrument(m, n, { vibDelay: 2, vibDepth: 100, vibSpeed: 30, pwStep: 99, pwMin: 3, pwMax: 250, arp: 5, release });
  m.start(song({ speed: 1, voices: [[[0, 0], 'stop'], [[0, 0], 'stop'], [[0, 0], 'stop']], patterns: [[C4, 100, END]] }));
  let max = 0;
  for (let i = 0; i < 100; i++) max = Math.max(max, m.frame());
  return max;
}

test('run time: the worst case (vibrato starts on all voices at once, speed 1)', () => {
  const normal = worstCase(2);
  const extreme = worstCase(255);                   // limited to 32 frames by the player
  console.log(`music_play, worst case: ${normal} cycles with inst_release 2, ${extreme} with inst_release 255 (=32)`);
  assert.ok(normal < FRAME_CYCLES / 3.5, `${normal} cycles`);   // about 5000: 25 % of a frame
  assert.ok(extreme < FRAME_CYCLES / 2, `${extreme} cycles`);
});

// Render `frames` frames through the real SID: the player runs once per frame, the SID gets its writes at the
// right cycle. Returns the samples (Int16Array).
function renderAudio(machine, frames, sampleRate = 48000) {
  const sid = createSid(sidModule);
  assert.ok(sid.init(MOS6581, sampleRate));
  for (let reg = 0; reg < 25; reg++) sid.write(reg, machine.sid[reg]);   // what music_init already wrote
  const chunks = [];
  let now = 0;                                  // cycles into the current frame that the SID has been clocked to
  const clockTo = (cycle) => {
    if (cycle > now) {
      const n = sid.clock(cycle - now);
      chunks.push(sid.samples.slice(0, n));
      now = cycle;
    }
  };
  machine.sidListener = (entry) => {
    clockTo(entry.cycle);
    sid.write(entry.reg, entry.value);
  };
  for (let i = 0; i < frames; i++) {
    now = 0;
    machine.frame();
    clockTo(FRAME_CYCLES);
  }
  machine.sidListener = null;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function measureHz(samples, sampleRate, from, to) {
  let mean = 0;
  for (let i = from; i < to; i++) mean += samples[i];
  mean /= to - from;
  let first = -1, last = -1, crossings = 0;
  for (let i = from + 1; i < to; i++) {
    if (samples[i - 1] - mean < 0 && samples[i] - mean >= 0) {
      if (first < 0) first = i;
      last = i;
      crossings++;
    }
  }
  return (crossings - 1) * sampleRate / (last - first);
}

function wav(samples, rate = 48000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

test('audio: a held A-4 pulse note is a 440 Hz tone, and the notes of a scale have the right pitch', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x00, sr: 0xF0 });
  m.start(oneVoice([A4, 60, END], 1));
  const samples = renderAudio(m, 50);
  const hz = measureHz(samples, 48000, 12000, samples.length);
  assert.ok(Math.abs(hz - 440) < 4.4, `measured ${hz.toFixed(1)} Hz`);

  // a few more notes, one per run: C-4, E-4, A-3, A-5
  for (const [pitch, expected] of [[C4, 261.63], [C4 + 4, 329.63], [A3, 220], [A4 + 12, 880]]) {
    const mm = new Machine();
    setInstrument(mm, 0, { ad: 0x00, sr: 0xF0 });
    mm.start(oneVoice([pitch, 60, END], 1));
    const s = renderAudio(mm, 50);
    const measured = measureHz(s, 48000, 12000, s.length);
    assert.ok(Math.abs(measured - expected) < expected * 0.01, `pitch ${pitch}: ${measured.toFixed(1)} Hz, expected ${expected}`);
  }
});

test('audio: the demo song plays, makes sound on all three voices, does not clip', () => {
  const m = new Machine();
  m.call('music_init', SONG & 255, SONG >> 8);
  const samples = renderAudio(m, 50 * 16);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  assert.ok(peak > 2000, `peak ${peak}`);
  assert.ok(peak < 32000, `peak ${peak} clips`);
  if (process.env.WAV_DIR) writeFileSync(`${process.env.WAV_DIR}/demo-js.wav`, wav(samples));
});

// ---------------------------------------------------------------------------------------------------
// The clean end and the start of a note on the real SID (see check_release and write_voice in music.asm)
// ---------------------------------------------------------------------------------------------------

test('the release nibble of inst_sr is never written to the SID', () => {
  const m = new Machine();
  setInstrument(m, 0, { ad: 0x29, sr: 0xBF });
  m.start(oneVoice([C4, 2, C5, 2, REST, 1, A4, 1, END], 3));
  for (let i = 0; i < 24; i++) {
    m.frame();
    for (const e of m.log.filter((w) => w.reg === 6)) assert.equal(e.value & 15, 0, `frame ${i}: sr ${e.value.toString(16)}`);
  }
});

test('a note of 3 frames or more is always preceded by 2 or more frames with the gate low', () => {
  // Every speed 1 to 6, notes of 1 to 4 ticks in a row, each as long as the one before or not. The SID
  // needs the 2 frames to finish the previous release, so a note that follows a clean end starts on time.
  for (let speed = 1; speed <= 6; speed++) {
    const m = new Machine();
    setInstrument(m, 0, { ad: 0x06, sr: 0xF0, release: 2 });
    const lengths = [1, 2, 3, 4, 4, 3, 2, 1, 3, 3, 4];
    m.start(oneVoice(lengths.flatMap((l, i) => [C4 + (i % 5), l]).concat([END]), speed));
    const frames = m.run(lengths.reduce((a, b) => a + b) * speed);
    let at = 0;                                      // first frame of the current note
    lengths.forEach((l, i) => {
      const frameCount = l * speed;
      if (i > 0 && frameCount >= 3) {
        // the frames just before this note belong to the previous note: its last 2 must have the gate low
        // when that note was long enough for a clean end
        const prevFrames = lengths[i - 1] * speed;
        if (prevFrames >= 3) {
          assert.equal(frames[at - 1][0].gate, 0, `speed ${speed}, note ${i}: gate low in the frame before`);
          assert.equal(frames[at - 2][0].gate, 0, `speed ${speed}, note ${i}: and the frame before that`);
        }
      }
      if (frameCount >= 3) assert.equal(frames[at][0].gate, 1, `speed ${speed}, note ${i} sounds in its first frame`);
      at += frameCount;
    });
  }
});

// Onset of a sound: the first millisecond whose mean absolute sample step is above 25 % of the first note's peak.
// Returns the onset (ms after the note's first frame) of every note after the first one.
function onsets(samples, noteFrames, count) {
  const perMs = 48;
  const env = new Float32Array(Math.floor(samples.length / perMs));
  for (let m = 0; m < env.length; m++) {
    let a = 0;
    for (let j = 1; j < perMs; j++) a += Math.abs(samples[m * perMs + j] - samples[m * perMs + j - 1]);
    env[m] = a / (perMs - 1);
  }
  const msPerFrame = FRAME_CYCLES / PAL_CLOCK * 1000;
  const window = (k) => [Math.round(k * noteFrames * msPerFrame), Math.round((k + 1) * noteFrames * msPerFrame)];
  const [a0, b0] = window(0);
  let peak = 0;
  for (let i = a0; i < b0; i++) peak = Math.max(peak, env[i]);
  const result = [];
  for (let k = 1; k < count; k++) {
    const [a, b] = window(k);
    let on = -1;
    for (let i = a; i < b; i++) if (env[i] > peak * 0.25) { on = i - a; break; }
    result.push(on);
  }
  return { first: (() => { for (let i = a0; i < b0; i++) if (env[i] > peak * 0.25) return i - a0; return -1; })(), rest: result };
}

test('audio: every repeated note starts on its tick (the SID envelope delay bug does not hit)', () => {
  // With attack 0 and a decay above 0, about one note in nine used to start two frames late: the gate opened
  // in the one cycle in which the SID's rate counter was one step from its 9-cycle limit. Sustain with a
  // release nibble made it worse. 24 notes per instrument; the chip must make sound within a frame of the first note's onset.
  // (the last three have decay 0: the sustain already runs at the fastest rate, so even a release of 1 frame works)
  const cases = [[0x06, 0xF0, 2], [0x06, 0xFF, 2], [0x06, 0xF0, 1], [0x16, 0xF0, 2], [0x56, 0xA0, 2], [0x02, 0x80, 2],
    [0x08, 0xF4, 0], [0x10, 0xF0, 1], [0x00, 0xF0, 1]];
  for (const [ad, sr, release] of cases) {
    const m = new Machine();
    setInstrument(m, 0, { ad, sr, release });
    const count = 24;
    m.start(oneVoice(Array.from({ length: count }, () => [A4, 2]).flat().concat([END]), 3));
    const samples = renderAudio(m, count * 6);
    const { first, rest } = onsets(samples, 6 * 1, count);
    assert.ok(first >= 0 && first < 10, `first note, ad ${ad.toString(16)}: onset ${first} ms`);
    const late = rest.filter((on) => on < 0 || on > first + 20);
    assert.deepEqual(late, [], `ad ${ad.toString(16)} sr ${sr.toString(16)} release ${release}: onsets ${rest}`);
  }
});
