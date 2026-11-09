// Tests for live.js, with a small fake serialiser, plus one run against the real model.
// Run: node --test web/app/live.test.mjs
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLive, diffBytes, mapIndex, instrumentBytes, sizeInfo, tableAddress, TABLE_NAMES, SONG_BASE,
} from './live.js';
import { fakeModel, fakeSerialiseSong, symbols, note, sampleProject } from './fake-model.mjs';


const project = sampleProject;

const withProject = (mutate) => { const p = structuredClone(project()); mutate(p); return p; };

// ---- diffBytes ----------------------------------------------------------

test('diffBytes: identical -> nothing, one byte -> one write at the right address', () => {
  assert.deepEqual(diffBytes(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3), 0x2000), []);
  const runs = diffBytes(Uint8Array.of(1, 2, 3, 4), Uint8Array.of(1, 9, 3, 4), 0x2000);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].address, 0x2001);
  assert.deepEqual([...runs[0].bytes], [9]);
});

test('diffBytes: near changes merge, far changes stay apart', () => {
  const a = new Uint8Array(100);
  const b = a.slice();
  b[10] = 1; b[14] = 2; b[60] = 3;
  const runs = diffBytes(a, b, 0x1000);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].address, 0x100A);
  assert.deepEqual([...runs[0].bytes], [1, 0, 0, 0, 2]);
  assert.equal(runs[1].address, 0x103C);
});

test('diffBytes: a longer array writes the tail, a missing previous writes everything', () => {
  const runs = diffBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3, 4), 0x3000);
  assert.deepEqual(runs.map((r) => [r.address, [...r.bytes]]), [[0x3002, [3, 4]]]);
  assert.deepEqual(diffBytes(null, Uint8Array.of(7, 8), 0x10).map((r) => [r.address, [...r.bytes]]), [[0x10, [7, 8]]]);
  assert.deepEqual(diffBytes(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2), 0x10), [], 'shrinking writes nothing');
});

// ---- table addresses, sizes ----------------------------------------------

test('tableAddress prefers the symbols, falls back to the fixed layout', () => {
  assert.equal(tableAddress('inst_wave', {}), 0x2000);
  assert.equal(tableAddress('inst_release', {}), 0x2E00);
  assert.equal(tableAddress('inst_ad', { inst_ad: 0x5000 }), 0x5000);
});

test('instrumentBytes counts up to the highest used slot, sizeInfo gives the free space', () => {
  assert.equal(instrumentBytes([]), 0);
  assert.equal(instrumentBytes([{}, null, {}, null]), 3 * 15);
  const info = sizeInfo({ instruments: [{}, {}] }, 100);
  assert.deepEqual(info, { song: 100, instruments: 30, free: 0xC000 - 0x3000 - 100 });
});

// ---- the live object -----------------------------------------------------

test('snapshot has all instrument tables and the song', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const writes = live.snapshot();
  assert.equal(writes.length, TABLE_NAMES.length + 1);
  const wave = writes.find((w) => w.address === 0x2000);
  assert.equal(wave.bytes[0], 0x40);
  assert.equal(wave.bytes[1], 0x20);
  assert.equal(writes[writes.length - 1].address, SONG_BASE);
  assert.equal(live.songSize, writes[writes.length - 1].bytes.length);
});

test('an instrument edit is one tiny write and needs no playhead', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const state = { running: true, frameInTick: 1, voices: [{ orderPos: 0, patAddr: live.map.patterns[0].address, patPos: 2, ticksLeft: 3 }, null, null] };
  const edit = live.diff(withProject((p) => { p.instruments[1].ad = 0x99; }), state);
  assert.deepEqual(edit.writes.map((w) => [w.address, [...w.bytes]]), [[0x2101, [0x99]]]);
  assert.deepEqual(edit.playhead, [null, null, null]);
});

test('no change -> null', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  assert.equal(live.diff(project(), null), null);
});

test('a speed change also writes the live speed in the state block', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const edit = live.diff(withProject((p) => { p.song.speed = 4; }), null);
  assert.ok(edit.writes.some((w) => w.address === SONG_BASE && w.bytes[0] === 4));
  const live2 = edit.writes.find((w) => w.address === symbols.st_speed);
  assert.deepEqual([...live2.bytes], [4]);
});

test('inserting a note before the playhead moves it along', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const oldMap = live.map;
  // voice 0 plays pattern 0, the next event to read is note 3 (index 2, offset 4)
  const state = { running: true, frameInTick: 2, voices: [{ orderPos: 0, patAddr: oldMap.patterns[0].address, patPos: 4, ticksLeft: 5 }, null, null] };
  const edit = live.diff(withProject((p) => { p.song.patterns[0].events.splice(0, 0, note(5)); }), state);
  assert.equal(edit.playhead[1], null);
  assert.deepEqual(edit.playhead[0], { orderPos: 0, patAddr: live.map.patterns[0].address, patPos: 6 });
  assert.equal(edit.playhead[0].ticksLeft, undefined, 'ticks left stay as they are');
});

test('a longer first pattern moves the second pattern, and a voice inside it follows', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const oldMap = live.map;
  const state = { running: true, frameInTick: 0, voices: [null, { orderPos: 0, patAddr: oldMap.patterns[1].address, patPos: 2, ticksLeft: 1 }, null] };
  const edit = live.diff(withProject((p) => { p.song.patterns[0].events.push(note(20), note(21)); }), state);
  assert.equal(edit.playhead[0], null);
  assert.deepEqual(edit.playhead[1], { orderPos: 0, patAddr: live.map.patterns[1].address, patPos: 2 });
  assert.equal(live.map.patterns[1].address, oldMap.patterns[1].address + 4);
});

test('editing a pattern the voice is not in leaves the playhead alone', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const state = { running: true, frameInTick: 0, voices: [{ orderPos: 0, patAddr: live.map.patterns[0].address, patPos: 2, ticksLeft: 1 }, null, null] };
  const edit = live.diff(withProject((p) => { p.song.patterns[0].events[2].pitch = 33; }), state);
  assert.deepEqual(edit.playhead, [null, null, null]);
  assert.equal(edit.writes.length, 1);
});

test('no playhead fix-up when nothing plays', () => {
  const live = createLive({ model: fakeModel, symbols });
  live.rebuild(project());
  const edit = live.diff(withProject((p) => { p.song.patterns[0].events.splice(0, 0, note(5)); }), null);
  assert.deepEqual(edit.playhead, [null, null, null]);
  const stopped = { running: false, frameInTick: 0, voices: [{ orderPos: 0, patAddr: 0, patPos: 0, ticksLeft: 0 }, null, null] };
  assert.deepEqual(live.diff(withProject((p) => { p.song.patterns[0].events.splice(0, 1); }), stopped).playhead, [null, null, null]);
});

test('a serialiser that throws leaves the mirror as it was', () => {
  let fail = false;
  const model = { ...fakeModel, serialiseSong: (...a) => { if (fail) throw new Error('too big'); return fakeSerialiseSong(...a); } };
  const live = createLive({ model, symbols });
  live.rebuild(project());
  const before = live.songSize;
  fail = true;
  assert.throws(() => live.diff(withProject((p) => { p.song.speed = 2; }), null), /too big/);
  assert.equal(live.songSize, before);
  fail = false;
  const edit = live.diff(withProject((p) => { p.song.speed = 2; }), null);
  assert.ok(edit.writes.some((w) => w.address === symbols.st_speed), 'still diffed against the last good bytes');
});

test('startAt: playhead and state writes for play-from-cursor', () => {
  const live = createLive({ model: fakeModel, symbols });
  const p = withProject((q) => {
    q.song.patterns[0].events.unshift({ type: 'inst', instrument: 1 });
    q.song.orders[1] = [{ pattern: 0, transpose: 0 }, { pattern: 1, transpose: -5 }];
  });
  live.rebuild(p);
  const map = live.map;
  const edit = live.startAt(p, { voice: 1, orderIndex: 1, eventIndex: 1, instrument: 0 });
  // voice 0: entry 1 = pattern 1, event 0; voice 1: entry 1 = pattern 1, event 1; voice 2: no entries
  assert.deepEqual(edit.playhead[0], { orderPos: 2, patAddr: map.patterns[1].address, patPos: 0, ticksLeft: 0 });
  assert.deepEqual(edit.playhead[1], { orderPos: 2, patAddr: map.patterns[1].address, patPos: 2, ticksLeft: 0 });
  assert.equal(edit.playhead[2], null);
  const at = (a) => [...edit.writes.find((w) => w.address === a).bytes];
  assert.deepEqual(at(symbols.st_transpose), [3]);
  assert.deepEqual(at(symbols.st_transpose + 1), [251], 'negative transpose as a byte');
  assert.deepEqual(at(symbols.st_instr), [1], 'instrument set earlier in pattern 0 carries over');
});

test('toStorePlayhead maps engine state to order/event indices', () => {
  const live = createLive({ model: fakeModel, symbols });
  const p = project();
  live.rebuild(p);
  const map = live.map;
  const state = {
    running: true, frameInTick: 4,
    voices: [
      { orderPos: 2, patAddr: map.patterns[1].address, patPos: 2, ticksLeft: 2 },
      { orderPos: 0, patAddr: 0x7777, patPos: 0, ticksLeft: 0 },
      { orderPos: 0, patAddr: map.patterns[0].address, patPos: 6, ticksLeft: 1 },
    ],
  };
  const out = live.toStorePlayhead(state, p);
  assert.equal(out.running, true);
  assert.equal(out.frameInTick, 4);
  assert.deepEqual(out.voices[0], { orderIndex: 1, eventIndex: 0, patternIndex: 1, ticksLeft: 2 });
  assert.equal(out.voices[1], null, 'an unknown pattern address is not shown');
  assert.equal(out.voices[2].eventIndex, 2, 'at the end marker the last event is the sounding one');
  assert.deepEqual(live.toStorePlayhead({ running: false, voices: [], frameInTick: 0 }, p).voices, [null, null, null]);
  assert.equal(live.toStorePlayhead(null, p).running, false);
});

// ---- against the real model ---------------------------------------------

test('with the real serialiser: insert a note, the playhead lands on the same event', async (t) => {
  let real;
  try {
    real = await import('../model/serialise.js');
  } catch {
    t.skip('web/model/serialise.js is not there');
    return;
  }
  const instrument = { name: 'b', wave: 0x40, ad: 0x09, sr: 0, pw: 0x800, pwStep: 0, pwMin: 0x20, pwMax: 0xE0,
    vibDelay: 0, vibDepth: 0, vibSpeed: 0, arp: 0, drumNoise: 0, drumFall: 0, release: 2 };
  const base = {
    instruments: [instrument],
    song: {
      name: 'r', speed: 6,
      patterns: [{ name: '', events: [note(10, 2), note(12, 2), note(14, 2), note(16, 2)] }],
      orders: [[{ pattern: 0, transpose: 0 }, { loop: 0 }], [{ stop: true }], [{ stop: true }]],
    },
  };
  const live = createLive({ model: real, symbols });
  live.rebuild(base);
  const old = live.map.patterns[0];
  const state = { running: true, frameInTick: 0, voices: [{ orderPos: 0, patAddr: old.address, patPos: old.events[2].offset, ticksLeft: 1 }, null, null] };
  const edited = structuredClone(base);
  edited.song.patterns[0].events.unshift(note(5, 1));
  const edit = live.diff(edited, state);
  const now = live.map.patterns[0];
  assert.equal(edit.playhead[0].patPos, now.events[3].offset, 'still waiting for what was the third note');
  assert.equal(edit.playhead[0].patAddr, now.address);
  const out = live.toStorePlayhead({ ...state, voices: [{ ...edit.playhead[0], ticksLeft: 1 }, null, null] }, edited);
  assert.equal(out.voices[0].eventIndex, 2, 'the second old note (now index 2) is sounding');
});

test('mapIndex follows inserts, deletes and changes', () => {
  const before = ['a', 'b', 'c', 'd'];
  assert.equal(mapIndex(before, ['x', 'a', 'b', 'c', 'd'], 2), 3, 'insert at the start');
  assert.equal(mapIndex(before, ['a', 'b', 'x', 'c', 'd'], 1), 1, 'insert after it');
  assert.equal(mapIndex(before, ['a', 'b', 'x', 'c', 'd'], 2), 3, 'insert before it');
  assert.equal(mapIndex(before, ['a', 'c', 'd'], 3), 2, 'delete before it');
  assert.equal(mapIndex(before, ['a', 'd'], 1), 1, 'the deleted one: the next one takes its place');
  assert.equal(mapIndex(before, ['a', 'B', 'c', 'd'], 1), 1, 'changed in place');
  assert.equal(mapIndex(before, [], 2), 0);
});
