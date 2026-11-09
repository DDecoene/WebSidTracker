// Integration test: the real player in the real engine, edited while it plays.
//
// Run: node --test web/app/integration.test.mjs
//
// The pieces are tested on their own elsewhere. This file checks that they agree about
// what the player's state block means, using the real serialiser, the real live.js diff
// and the real player.prg:
//
//  - st_order_pos is the order entry of the pattern that is playing now, st_pat_pos is the
//    byte offset of the next event to read (the sounding note is already behind it);
//  - an edit that moves bytes (a note inserted or deleted before the playhead) must keep
//    every voice on the same music, and
//  - it must do so even when the state it was computed from is a few frames old, because
//    that is all the page ever has (state messages come 20 times a second).
//
// The SID chip is replaced by a recorder: only the register writes matter here.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../engine/engine.js';
import * as projectModel from '../model/project.js';
import * as serialiser from '../model/serialise.js';
import { createLive, SONG_BASE, stateAfterEdit } from './live.js';

const symbols = JSON.parse(readFileSync(new URL('../player/symbols.json', import.meta.url), 'utf8'));
const playerPrg = new Uint8Array(readFileSync(new URL('../player/player.prg', import.meta.url)));
const model = { ...projectModel, ...serialiser };

// ---- a test machine: the engine with a recording chip ---------------------------------

function createRig() {
  const engine = new Engine({
    sidModule: new WebAssembly.Module(readFileSync(new URL('../sid/sid.wasm', import.meta.url))),
    playerPrg, symbols, sampleRate: 48000,
  });
  const frames = [];                        // frames[n] = the SID writes of frame n, as text
  let current = [];
  engine.sid = {
    samples: new Int16Array(4096),
    clock: (cycles) => Math.floor(cycles / 20),
    write: (reg, value) => current.push(`${reg}=${value}`),
    setModel() {},
  };
  const origRun = engine.runFrame.bind(engine);
  engine.runFrame = () => { current = []; origRun(); frames.push(current.join(',')); };
  const table = (name, n) => engine.ram[symbols[name] + n];
  const freqToPitch = (lo, hi) => {
    for (let p = 0; p < 96; p++) if (table('freq_lo', p) === lo && table('freq_hi', p) === hi) return p;
    return -1;
  };
  return { engine, frames, freqToPitch, step: (n) => { for (let i = 0; i < n; i++) engine.runFrame(); } };
}

const rig = createRig();

// Start a project from frame 0 on the shared rig.
function start(project) {
  const live = createLive({ model, symbols });
  live.rebuild(project);
  rig.engine.running = false;
  rig.frames.length = 0;
  for (const w of live.snapshot()) rig.engine.writeRam(w.address, w.bytes);
  rig.engine.start(SONG_BASE);
  return live;
}

const note = (pitch, length = 2) => ({ type: 'note', pitch, length });

// Three voices, speed 3, so a note of 2 ticks is 6 frames. Pattern 0 comes first in memory:
// editing it moves the addresses of patterns 1 and 2 as well.
function songProject({ passes = 1 } = {}) {
  const base = projectModel.newProject();
  const order = (p) => [...Array.from({ length: passes }, () => ({ pattern: p, transpose: 0 })), { stop: true }];
  base.song.speed = 3;
  base.song.patterns = [
    { name: 'a', events: [{ type: 'inst', instrument: 0 }, ...[24, 26, 28, 29, 31, 33, 35, 36].map((p) => note(p, 2))] },
    { name: 'b', events: [note(40, 3), { type: 'rest', length: 1 }, note(43, 2), note(45, 4), note(47, 2), note(48, 3)] },
    { name: 'c', events: [note(12, 1), note(14, 1), note(16, 2), note(17, 1), note(19, 1), note(21, 2), note(23, 3), note(24, 1)] },
  ];
  base.song.orders = [order(0), order(1), order(2)];
  return base;
}

const edited = (project, change) => { const copy = structuredClone(project); change(copy); return copy; };

// Run `project` for `at` frames, then apply the edit made by `change` from a state that is
// `lag` frames old, and run on to `total` frames. Returns what the SID was told, per frame.
function runWithEdit(project, change, { at, lag = 0, total = 140 }) {
  const live = start(project);
  rig.step(at - lag);
  const stale = rig.engine.readState();
  rig.step(lag);
  const after = edited(project, change);
  const edit = live.diff(after, stale);
  if (edit) rig.engine.applyEdit(edit);
  rig.step(total - at);
  return rig.frames.slice();
}

function run(project, total = 140) {
  start(project);
  rig.step(total);
  return rig.frames.slice();
}

// The notes that start, per voice: [{frame, pitch}]. A note starts when the control register
// gets the gate bit after it did not have it; the frequency written just before is its pitch.
function noteStarts(frames) {
  const voices = [[], [], []];
  const gate = [0, 0, 0];
  const freq = [[0, 0], [0, 0], [0, 0]];
  frames.forEach((text, n) => {
    for (const w of text ? text.split(',') : []) {
      const [reg, value] = w.split('=').map(Number);
      const v = Math.floor(reg / 7);
      if (reg > 20) continue;
      const r = reg % 7;
      if (r === 0) freq[v][0] = value;
      if (r === 1) freq[v][1] = value;
      if (r === 4) {
        const on = value & 1;
        if (on && !gate[v]) voices[v].push({ frame: n, pitch: rig.freqToPitch(freq[v][0], freq[v][1]) });
        gate[v] = on;
      }
    }
  });
  return voices;
}

// ---- the state block means what the model code assumes ---------------------------------

test('the state block: order entry of the playing pattern, offset of the next event to read', () => {
  const project = songProject({ passes: 2 });
  const live = start(project);
  const map = live.map;
  // frame 0 reads the first note of every voice: the instrument event and the note are behind it
  rig.step(1);
  let state = rig.engine.readState();
  for (let v = 0; v < 3; v++) {
    const loc = serialiser.locatePlayhead(map, state.voices[v], v);
    assert.equal(loc.entry, 0, `voice ${v} is on entry 0`);
    assert.equal(loc.patternIndex, v);
    const first = project.song.patterns[v].events.findIndex((e) => e.type === 'note');
    assert.equal(loc.playingIndex, first, `voice ${v}: the first note sounds`);
    assert.equal(loc.eventIndex, first + 1, `voice ${v}: the next event to read follows it`);
  }
  // the last note of voice 0 (event 8) has been read, patPos points at the end marker; the entry has not moved yet
  rig.step(3 * 2 * 8 - 1);
  state = rig.engine.readState();
  let loc = serialiser.locatePlayhead(map, state.voices[0], 0);
  assert.equal(loc.entry, 0);
  assert.equal(loc.eventIndex, 9, 'end marker');
  assert.equal(loc.playingIndex, 8);
  // one tick later the second pass has started: entry 1, first note read
  rig.step(6);
  state = rig.engine.readState();
  loc = serialiser.locatePlayhead(map, state.voices[0], 0);
  assert.equal(loc.entry, 1);
  assert.equal(loc.playingIndex, 1);
});

// ---- edits that move bytes, with a fresh state and with an old one -----------------------

const LAGS = [0, 1, 2, 3, 4, 5];

// Insert a note before the sounding one: the music must not change at all.
test('insert a note before the playhead: every voice plays on as if nothing happened', () => {
  const project = songProject();
  const reference = run(project);
  for (let at = 30; at < 110; at++) {
    for (const lag of LAGS) {
      const frames = runWithEdit(project, (p) => { p.song.patterns[0].events.splice(2, 0, note(60, 2)); }, { at, lag });
      // voices 1 and 2 have no edit at all, but their patterns moved in memory
      const starts = noteStarts(frames);
      const refStarts = noteStarts(reference);
      for (const v of [1, 2]) {
        assert.deepEqual(starts[v], refStarts[v], `voices ${v}: at frame ${at}, lag ${lag}`);
      }
    }
  }
});

test('insert before the playhead, voice 0 itself: identical frames when it is past the new note', () => {
  const project = songProject();
  const reference = run(project);
  // voice 0: the instrument event, then a note every 6 frames from frame 0; event 3 starts at frame 12
  for (let at = 20; at < 100; at++) {
    for (const lag of LAGS) {
      const frames = runWithEdit(project, (p) => { p.song.patterns[0].events.splice(1, 0, note(60, 2)); }, { at, lag });
      // all of voice 0 after `at` is the same music: compare the notes that start after the edit,
      // leaving out a note that starts inside the stale window
      const got = noteStarts(frames)[0].filter((n) => n.frame > at + 1);
      const want = noteStarts(reference)[0].filter((n) => n.frame > at + 1);
      assert.deepEqual(got, want, `frame ${at}, lag ${lag}`);
    }
  }
});

test('delete events before the playhead: the music goes on unchanged', () => {
  const project = songProject();
  const reference = run(project);
  for (let at = 30; at < 100; at++) {
    for (const lag of LAGS) {
      const frames = runWithEdit(project, (p) => { p.song.patterns[0].events.splice(1, 2); }, { at, lag });
      const got = noteStarts(frames);
      const want = noteStarts(reference);
      assert.deepEqual(got[0].filter((n) => n.frame > at + 1), want[0].filter((n) => n.frame > at + 1), `v0 frame ${at}, lag ${lag}`);
      for (const v of [1, 2]) assert.deepEqual(got[v], want[v], `v${v} frame ${at}, lag ${lag}`);
    }
  }
});

test('insert a note ahead of the playhead: it is played, at the right place, once', () => {
  const project = songProject();
  const reference = noteStarts(run(project))[0];
  for (let at = 5; at <= 36; at++) {
    for (const lag of [0, 3]) {
      const got = noteStarts(runWithEdit(project, (p) => { p.song.patterns[0].events.splice(7, 0, note(60, 2)); }, { at, lag }))[0];
      // the sequence of pitches: the old ones, with 60 before the old event 7 (the seventh note, pitch 35)
      const pitches = reference.map((n) => n.pitch);
      pitches.splice(pitches.indexOf(35), 0, 60);
      assert.deepEqual(got.map((n) => n.pitch), pitches, `frame ${at}, lag ${lag}`);
      // and everything before the new note keeps its time
      const cut = got.findIndex((n) => n.pitch === 60);
      assert.deepEqual(got.slice(0, cut), reference.slice(0, cut));
    }
  }
});

// ---- the playhead crosses an order entry while the state is old -----------------------------

test('the voice moves on to the next entry while the state is old: no pattern is played twice', () => {
  const project = songProject({ passes: 2 });
  // voice 0: pattern 0 is 8 notes of 6 frames: entry 1 starts at frame 48
  const change = (p) => { p.song.patterns[0].events.splice(1, 0, note(60, 2)); };
  for (let at = 40; at < 58; at++) {
    const fresh = noteStarts(runWithEdit(project, change, { at, lag: 0, total: 190 }));
    for (const lag of [1, 2, 3, 4, 5]) {
      const old = noteStarts(runWithEdit(project, change, { at, lag, total: 190 }));
      for (let v = 0; v < 3; v++) assert.deepEqual(old[v], fresh[v], `voice ${v}, frame ${at}, lag ${lag}`);
    }
  }
});

test('deleting an order entry before the playhead keeps the voice in its pattern', () => {
  const project = songProject({ passes: 3 });
  project.song.patterns.push({ name: 'd', events: [note(50, 2), note(52, 2), note(54, 2)] });
  project.song.orders[0] = [{ pattern: 0, transpose: 0 }, { pattern: 3, transpose: 0 }, { pattern: 3, transpose: 5 }, { stop: true }];
  const change = (p) => { p.song.orders[0].splice(0, 1); };
  // frame 48 on, voice 0 is in entry 1 (pattern 3); after the delete that is entry 0
  const got = noteStarts(runWithEdit(project, change, { at: 51, lag: 0, total: 120 }))[0];
  const after = got.filter((n) => n.frame > 52).map((n) => n.pitch);
  assert.deepEqual(after, [52, 54, 55, 57, 59], 'the rest of pattern 3, then pattern 3 again at +5');
});

// ---- two edits before the engine has answered ----------------------------------------------

test('two edits in a row from one old state: the second one is computed from the corrected state', () => {
  const project = songProject({ passes: 2 });
  const reference = noteStarts(run(project, 190));
  for (let at = 22; at < 100; at++) {
    for (const lag of [0, 2, 5]) {
      const live = start(project);
      rig.step(at - lag);
      let stale = rig.engine.readState();
      rig.step(lag);
      const first = edited(project, (p) => { p.song.patterns[0].events.splice(2, 0, note(60, 2)); });
      const second = edited(first, (p) => { p.song.patterns[0].events.splice(1, 1); });
      const editA = live.diff(first, stale);
      stale = stateAfterEdit(stale, editA);
      const editB = live.diff(second, stale);
      rig.engine.applyEdit(editA);
      rig.engine.applyEdit(editB);
      rig.step(190 - at);
      const got = noteStarts(rig.frames);
      for (let v = 1; v < 3; v++) assert.deepEqual(got[v], reference[v], `voice ${v}, frame ${at}, lag ${lag}`);
      // voice 0: the notes that start well after the edit are the old ones (the second pass has
      // the changed pattern: 60 in place of the first note, hence compare the first pass only)
      const early = (list) => list.filter((n) => n.frame > at + 6 && n.frame < 48).map((n) => [n.frame, n.pitch]);
      assert.deepEqual(early(got[0]), early(reference[0]), `voice 0, frame ${at}, lag ${lag}`);
    }
  }
});
