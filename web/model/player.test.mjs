// Runs the REAL player (web/player/player.prg in our 6502 core) on songs made by the model and checks
// that the model and the player agree: where the player says it is (st_order_pos, st_pat_pos, ...)
// versus the model event that is playing, and that the exported .prg plays exactly like the in-memory route.
//
// Run: node --test web/model/player.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Cpu6502 } from '../cpu/cpu6502.js';
import { LIMITS, demoProject, lint, newProject, validate } from './project.js';
import { INSTRUMENT_TABLES, locatePlayhead, playheadFromLocation, serialiseInstruments, serialiseSong } from './serialise.js';
import { exportPrg } from './export.js';

const prg = new Uint8Array(readFileSync(new URL('../player/player.prg', import.meta.url)));
const symbols = JSON.parse(readFileSync(new URL('../player/symbols.json', import.meta.url), 'utf8'));
const PAL = 985248;
const freqOf = (pitch) => Math.min(65535, Math.round(440 * 2 ** ((pitch - 57) / 12) * 16777216 / PAL));
const clampPitch = (p) => Math.min(95, Math.max(0, p));

// A C64 that is just RAM, the player, a CPU and a log of the SID writes.
class Machine {
  constructor(image = prg) {
    this.ram = new Uint8Array(65536);
    const load = image[0] | (image[1] << 8);
    this.ram.set(image.subarray(2), load);
    this.writes = [];                 // every SID write: { frame, cycle, reg, value }
    this.frame = 0;
    this.start = 0;
    this.cpu = new Cpu6502({
      read: (a) => this.ram[a],
      write: (a, v) => {
        this.ram[a] = v;
        if (a >= 0xD400 && a <= 0xD418) this.writes.push({ frame: this.frame, cycle: this.cpu.cycles - this.start, reg: a - 0xD400, value: v });
      },
    });
    this.cpu.sp = 0xFF;
  }

  load(project, base = LIMITS.songBase) {
    const tables = serialiseInstruments(project.instruments);
    INSTRUMENT_TABLES.forEach((name, k) => this.ram.set(tables[name], LIMITS.instrumentBase + k * 0x100));
    const song = serialiseSong(project.song, base);
    this.ram.set(song.bytes, base);
    return song;
  }

  init(base = LIMITS.songBase) {
    this.cpu.a = base & 255;
    this.cpu.x = base >> 8;
    this.cpu.call(symbols.music_init, 100000);
    this.writes = [];
    this.frame = 0;
  }

  step() {
    this.start = this.cpu.cycles;
    this.cpu.call(symbols.music_play, 100000);
    this.frame++;
  }

  state() {
    const r = this.ram;
    return {
      running: r[symbols.st_running],
      voices: [0, 1, 2].map((v) => ({
        orderPos: r[symbols.st_order_pos + v],
        patAddr: r[symbols.st_pat_lo + v] | (r[symbols.st_pat_hi + v] << 8),
        patPos: r[symbols.st_pat_pos + v],
        ticksLeft: r[symbols.st_ticks_left + v],
        instrument: r[symbols.st_instr + v],
        pitch: r[symbols.st_pitch + v],
      })),
    };
  }
}

// The model's own idea of what plays at each tick of each voice, worked out without the player.
// Yields { entry, pattern, event, instrument, pitch, rest, startsHere } per tick, forever (loops) or until STOP.
function* timeline(project, voice) {
  const { song } = project;
  const list = song.orders[voice];
  let instrument = 0;
  let entry = 0;
  let guard = 0;
  for (;;) {
    const e = list[entry];
    if (!e || e.stop) return;
    if (e.loop !== undefined) { entry = e.loop; if (++guard > 1000) return; continue; }
    const pattern = song.patterns[e.pattern];
    for (let i = 0; i < pattern.events.length; i++) {
      const ev = pattern.events[i];
      if (ev.type === 'inst') { instrument = ev.instrument; continue; }
      if (ev.type !== 'note' && ev.type !== 'rest') continue;
      for (let t = 0; t < ev.length; t++) {
        guard = 0;
        yield { entry, pattern: e.pattern, event: i, instrument, rest: ev.type === 'rest', pitch: ev.type === 'note' ? clampPitch(ev.pitch + e.transpose) : null, first: t === 0 };
      }
    }
    entry++;
  }
}

test('locatePlayhead agrees with the real player on the demo, all voices, the whole loop twice', () => {
  const project = demoProject();
  const m = new Machine();
  const song = m.load(project);
  m.init();
  const speed = project.song.speed;
  const lines = [0, 1, 2].map((v) => timeline(project, v));
  const frames = 2 * 256 * speed + 40;
  let checked = 0;
  for (let f = 0; f < frames; f++) {
    m.step();
    const tick = Math.floor(f / speed);
    const state = m.state();
    assert.equal(state.running, 1);
    if (f % speed === 0) lines.forEach((it, v) => { lines[v] = it; it.cur = it.next().value; });
    for (let v = 0; v < 3; v++) {
      const want = lines[v].cur;
      const loc = locatePlayhead(song.map, state.voices[v], v);
      const where = `frame ${f} (tick ${tick}) voice ${v + 1}`;
      assert.ok(loc, `${where}: no location for ${JSON.stringify(state.voices[v])}`);
      assert.deepEqual([loc.entry, loc.patternIndex, loc.playingIndex], [want.entry, want.pattern, want.event], where);
      assert.equal(state.voices[v].instrument, want.instrument, `${where}: instrument`);
      if (!want.rest) assert.equal(state.voices[v].pitch, want.pitch, `${where}: pitch`);
      // The new note starts in this very frame: its start shows as a control write with the test bit.
      const starts = m.writes.some((w) => w.frame === f && w.reg === v * 7 + 4 && (w.value & 8));
      if (want.first && !want.rest && starts) checked++;
    }
  }
  assert.ok(checked > 400, `only ${checked} note starts were seen`);
});

test('the SID writes show the event that locatePlayhead names (frequency and waveform)', () => {
  const project = demoProject();
  const m = new Machine();
  const song = m.load(project);
  m.init();
  const insts = project.instruments;
  let compared = 0;
  for (let f = 0; f < 256 * project.song.speed; f++) {
    m.step();
    const state = m.state();
    for (let v = 0; v < 3; v++) {
      const loc = locatePlayhead(song.map, state.voices[v], v);
      const ev = project.song.patterns[loc.patternIndex].events[loc.playingIndex];
      const mine = m.writes.filter((w) => w.frame === f && w.reg >= v * 7 && w.reg < v * 7 + 7);
      const reg = (r) => mine.filter((w) => w.reg === v * 7 + r).pop().value;
      const freq = reg(0) | (reg(1) << 8);
      const ctrl = reg(4);
      const inst = insts[state.voices[v].instrument];
      if (ev.type === 'rest') { assert.equal(ctrl & 1, 0, `frame ${f} voice ${v + 1}: gate must be closed in a rest`); continue; }
      const pitch = clampPitch(ev.pitch + project.song.orders[v][loc.entry].transpose);
      if (inst.drumNoise) {
        assert.ok(freq <= freqOf(pitch), `frame ${f} voice ${v + 1}: a drum never rises above its start frequency`);
      } else if (inst.arp) {
        assert.ok(freq === freqOf(pitch) || freq === freqOf(clampPitch(pitch + inst.arp)), `frame ${f} voice ${v + 1}: arpeggio frequency`);
      } else {
        const near = freqOf(pitch);
        assert.ok(Math.abs(freq - near) <= (inst.vibDepth ? near * 0.06 : 0), `frame ${f} voice ${v + 1}: ${freq} vs ${near}`);
      }
      if (ctrl & 1 && !inst.drumNoise) assert.equal(ctrl & 0xF0, inst.wave & 0xF0, `frame ${f} voice ${v + 1}: waveform`);
      compared++;
    }
  }
  assert.ok(compared > 600);
});

test('playheadFromLocation puts the player back where it was (same song, every frame)', () => {
  const project = demoProject();
  const m = new Machine();
  const song = m.load(project);
  m.init();
  for (let f = 0; f < 300; f++) {
    m.step();
    for (let v = 0; v < 3; v++) {
      const s = m.state().voices[v];
      const loc = locatePlayhead(song.map, s, v);
      const back = playheadFromLocation(song.map, loc, v);
      assert.deepEqual(back, { orderPos: s.orderPos, patAddr: s.patAddr, patPos: s.patPos }, `frame ${f} voice ${v + 1}`);
    }
  }
});

test('the playhead survives an edit made while the real player runs', () => {
  // Insert a rest at the start of pattern 0 (the bass groove) while it plays, move the player with
  // playheadFromLocation, and check it keeps playing the same note.
  const project = demoProject();
  const m = new Machine();
  const oldSong = m.load(project);
  m.init();
  for (let f = 0; f < 6 * 5 + 2; f++) m.step();     // inside the third note of the groove
  const s0 = m.state().voices[0];
  const loc = locatePlayhead(oldSong.map, s0, 0);
  const note = project.song.patterns[loc.patternIndex].events[loc.playingIndex];

  project.song.patterns[0].events.splice(1, 0, { type: 'rest', length: 1 });   // after the inst event
  const newSong = m.load(project);
  const to = playheadFromLocation(newSong.map, { ...loc, eventIndex: loc.eventIndex + 1, playingIndex: loc.playingIndex + 1 }, 0);
  m.ram[symbols.st_order_pos] = to.orderPos;
  m.ram[symbols.st_pat_lo] = to.patAddr & 255;
  m.ram[symbols.st_pat_hi] = to.patAddr >> 8;
  m.ram[symbols.st_pat_pos] = to.patPos;
  const ticksLeft = m.state().voices[0].ticksLeft;
  const again = locatePlayhead(newSong.map, m.state().voices[0], 0);
  assert.equal(project.song.patterns[0].events[again.playingIndex], project.song.patterns[0].events[loc.playingIndex + 1]);
  assert.equal(m.state().voices[0].ticksLeft, ticksLeft);
  assert.equal(note.type, 'note');
});

test('exportPrg: song and instrument region equal the serialiser output', () => {
  const project = demoProject();
  const out = exportPrg(project, prg);
  const load = out[0] | (out[1] << 8);
  assert.equal(load, prg[0] | (prg[1] << 8));
  const at = (address) => out.subarray(2 + address - load);
  const tables = serialiseInstruments(project.instruments);
  INSTRUMENT_TABLES.forEach((name, k) => {
    assert.deepEqual(Array.from(at(LIMITS.instrumentBase + k * 0x100).subarray(0, 256)), Array.from(tables[name]), name);
  });
  const song = serialiseSong(project.song, LIMITS.songBase);
  assert.deepEqual(Array.from(at(LIMITS.songBase).subarray(0, song.size)), Array.from(song.bytes));
  assert.equal(out.length, 2 + LIMITS.songBase + song.size - load, 'the prg ends where the song ends');
  // the player code part is untouched
  assert.deepEqual(Array.from(at(load).subarray(0, 0x1000 - load + 0x400)), Array.from(prg.subarray(2, 2 + 0x1000 - load + 0x400)));
});

test('the exported prg plays the same SID write stream (with cycles) as the in-memory route', () => {
  const project = demoProject();
  const a = new Machine();
  a.load(project);
  a.init();
  const b = new Machine(exportPrg(project, prg));
  b.init();
  const frames = 3 * 256 * project.song.speed / 2;
  for (let f = 0; f < frames; f++) { a.step(); b.step(); }
  assert.ok(a.writes.length > 10000);
  assert.deepEqual(b.writes, a.writes);
});

test('player limits: a pattern of 255 bytes and an order list of 128 entries really work', () => {
  const project = newProject();
  const events = [];
  for (let i = 0; i < 126; i++) events.push({ type: 'note', pitch: 12 + (i % 24), length: 1 });  // 252 bytes + 2 (inst) + 1 end = 255
  events.unshift({ type: 'inst', instrument: 0 });
  project.song.patterns[0].events = events;
  project.song.speed = 1;
  project.song.orders[0] = [{ pattern: 0, transpose: 0 }, { stop: true }];
  assert.deepEqual(validate(project), []);
  const m = new Machine();
  const song = m.load(project);
  assert.equal(song.map.patterns[0].endOffset + 1, 255);
  m.init();
  const pitches = [];
  for (let f = 0; f < 130; f++) { m.step(); if (m.state().voices[0].ticksLeft) pitches.push(m.state().voices[0].pitch); }
  assert.deepEqual(pitches.slice(0, 126), events.slice(1).map((e) => e.pitch), 'all 126 notes play, the last one at offset 253');
  // 256 bytes: refused
  events.push({ type: 'legato' });
  assert.match(validate(project)[0], /pattern 0 is 256 bytes, the player allows 255/);
  assert.throws(() => serialiseSong(project.song), /256 bytes/);

  // order list: 128 entries, the loop target 127 is reachable
  const long = newProject();
  long.song.patterns[0].events = [{ type: 'note', pitch: 40, length: 1 }];
  long.song.speed = 1;
  long.song.orders[0] = Array.from({ length: 127 }, () => ({ pattern: 0, transpose: 0 })).concat([{ loop: 126 }]);
  assert.deepEqual(validate(long), []);
  const m2 = new Machine();
  const s2 = m2.load(long);
  m2.init();
  for (let f = 0; f < 200; f++) m2.step();
  assert.equal(m2.state().voices[0].orderPos, 126 * 2, 'the voice runs through the entries and loops on entry 126');
  long.song.orders[0].push({ pattern: 0, transpose: 0 });
  assert.match(validate(long).join('\n'), /130 order entries/);
  assert.ok(s2.size > 0);
});

test('player semantics that the model warns about', () => {
  // legato directly after a note keeps the gate; the same marker after a rest does nothing to the rest
  const project = newProject();
  project.song.speed = 2;
  project.song.patterns[0].events = [{ type: 'inst', instrument: 0 }, { type: 'note', pitch: 40, length: 2 }, { type: 'legato' }, { type: 'note', pitch: 43, length: 2 }];
  project.song.orders[0] = [{ pattern: 0, transpose: 0 }, { stop: true }];
  assert.deepEqual(lint(project), []);
  const m = new Machine();
  m.load(project);
  m.init();
  const gates = [];
  for (let f = 0; f < 8; f++) { m.step(); gates.push(m.writes.filter((w) => w.frame === f && w.reg === 4).map((w) => w.value & 1).join('')); }
  assert.ok(!gates.slice(1, 4).some((g) => g.includes('0')), `the gate stays open through the legato join: ${gates}`);

  const bad = newProject();
  bad.song.patterns[0].events = [{ type: 'legato' }, { type: 'note', pitch: 40, length: 2 }];
  assert.match(lint(bad)[0], /legato must directly follow the note/);
  bad.song.patterns[0].events = [{ type: 'note', pitch: 40, length: 2 }, { type: 'legato' }];
  assert.match(lint(bad)[0], /last event/);
  bad.song.patterns[0].events = [{ type: 'note', pitch: 40, length: 1 }];
  bad.song.speed = 2;
  bad.instruments[0].release = 2;
  assert.deepEqual(lint(bad), [], 'a note of 2 frames has no clean end and sounds in full');
  bad.song.speed = 3;
  assert.match(lint(bad)[0], /first frame only/);
  bad.instruments[0].wave = 0x49;
  assert.match(lint(bad).join('\n'), /gate bit/);
  bad.instruments[0].sr = 0xA4;
  assert.match(lint(bad).join('\n'), /release nibble of sr is ignored/);
  bad.instruments[0].sr = 0xA0;
  bad.instruments[0].release = 1;
  assert.match(lint(bad).join('\n'), /release 1 is played as 2/);
  assert.deepEqual(lint(demoProject()), []);
});
