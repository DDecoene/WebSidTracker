// Tests for store.js. Run: node --test web/app/store.test.mjs
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.js';

const fresh = () => ({ instruments: [{ name: 'a' }], song: { name: 'x', speed: 6, patterns: [] } });

function record(store) {
  const seen = [];
  store.subscribe((change) => seen.push(change));
  return seen;
}

test('update works on a deep clone and replaces the project', () => {
  const original = fresh();
  const store = createStore(original);
  const seen = record(store);
  store.update('rename', (p) => { p.song.name = 'y'; p.instruments[0].name = 'b'; });
  assert.equal(store.project.song.name, 'y');
  assert.equal(original.song.name, 'x', 'the old project object is not touched');
  assert.equal(original.instruments[0].name, 'a');
  assert.notEqual(store.project, original);
  assert.deepEqual(seen, [{ kind: 'edit', label: 'rename' }]);
});

test('a mutator that changes nothing is ignored, one that throws changes nothing', () => {
  const store = createStore(fresh());
  const seen = record(store);
  store.update('noop', () => {});
  assert.equal(seen.length, 0);
  assert.equal(store.canUndo(), false);
  assert.throws(() => store.update('bad', (p) => { p.song.name = 'z'; throw new Error('boom'); }), /boom/);
  assert.equal(store.project.song.name, 'x');
  assert.equal(store.canUndo(), false);
});

test('undo and redo walk through the history', () => {
  const store = createStore(fresh());
  const seen = record(store);
  store.update('one', (p) => { p.song.speed = 5; });
  store.update('two', (p) => { p.song.speed = 4; });
  assert.equal(store.canUndo(), true);
  assert.equal(store.undoLabel(), 'two');
  store.undo();
  assert.equal(store.project.song.speed, 5);
  assert.equal(store.redoLabel(), 'two');
  store.undo();
  assert.equal(store.project.song.speed, 6);
  assert.equal(store.canUndo(), false);
  store.undo();                       // nothing left: no change, no notification
  store.redo();
  store.redo();
  assert.equal(store.project.song.speed, 4);
  assert.equal(store.canRedo(), false);
  assert.deepEqual(seen.map((c) => c.kind), ['edit', 'edit', 'undo', 'undo', 'redo', 'redo']);
  assert.equal(seen[2].label, 'two');
});

test('a new edit clears the redo stack', () => {
  const store = createStore(fresh());
  store.update('one', (p) => { p.song.speed = 5; });
  store.undo();
  assert.equal(store.canRedo(), true);
  store.update('other', (p) => { p.song.speed = 9; });
  assert.equal(store.canRedo(), false);
});

test('the history is limited', () => {
  const store = createStore(fresh(), { historyLimit: 3 });
  for (let i = 1; i <= 10; i++) store.update('n', (p) => { p.song.speed = i; });
  let steps = 0;
  while (store.canUndo()) { store.undo(); steps++; }
  assert.equal(steps, 3);
  assert.equal(store.project.song.speed, 7);
});

test('edits with the same merge key share one undo step, until the time window is over', () => {
  let clock = 1000;
  const store = createStore(fresh(), { now: () => clock });
  store.update('slider', (p) => { p.song.speed = 1; }, { merge: 'speed' });
  clock += 100;
  store.update('slider', (p) => { p.song.speed = 2; }, { merge: 'speed' });
  clock += 100;
  store.update('slider', (p) => { p.song.speed = 3; }, { merge: 'speed' });
  store.undo();
  assert.equal(store.project.song.speed, 6, 'one undo goes back to before the whole drag');
  assert.equal(store.canUndo(), false);
  store.redo();
  clock += 5000;
  store.update('slider', (p) => { p.song.speed = 4; }, { merge: 'speed' });
  store.undo();
  assert.equal(store.project.song.speed, 3, 'a later edit is a step of its own');
});

test('a different key or a plain edit in between breaks the merge', () => {
  const store = createStore(fresh(), { now: () => 0 });
  store.update('a', (p) => { p.song.speed = 1; }, { merge: 'k1' });
  store.update('b', (p) => { p.song.speed = 2; }, { merge: 'k2' });
  store.update('c', (p) => { p.song.speed = 3; });
  store.update('d', (p) => { p.song.speed = 4; }, { merge: 'k2' });
  let steps = 0;
  while (store.canUndo()) { store.undo(); steps++; }
  assert.equal(steps, 4);
});

test('load replaces the project and clears the history', () => {
  const store = createStore(fresh());
  store.update('one', (p) => { p.song.speed = 5; });
  store.select({ voice: 2, orderIndex: 4, eventIndex: 7, instrument: 3, octave: 5 });
  const seen = record(store);
  const next = fresh();
  next.song.name = 'loaded';
  store.load(next);
  assert.equal(store.project, next);
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
  assert.equal(seen[0].kind, 'load');
  assert.equal(store.selection.voice, 0);
  assert.equal(store.selection.orderIndex, 0);
  assert.equal(store.selection.octave, 5, 'octave is a user preference and survives');
});

test('select merges, and only tells the listeners about real changes', () => {
  const store = createStore(fresh());
  const seen = record(store);
  assert.deepEqual(store.selection, { voice: 0, orderIndex: 0, eventIndex: 0, instrument: 0, octave: 3, step: 1, defaultLength: 1 });
  store.select({ voice: 1 });
  store.select({ voice: 1 });
  store.select({ eventIndex: 3, octave: 4 });
  assert.equal(store.selection.voice, 1);
  assert.equal(store.selection.eventIndex, 3);
  assert.equal(store.selection.step, 1);
  assert.deepEqual(seen.map((c) => c.kind), ['select', 'select']);
});

test('playhead updates notify only when something changed', () => {
  const store = createStore(fresh());
  const seen = record(store);
  const state = { running: true, voices: [{ orderIndex: 0, eventIndex: 2, patternIndex: 0, ticksLeft: 1 }, null, null], frameInTick: 3 };
  store.setPlayhead(state);
  store.setPlayhead(structuredClone(state));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'playhead');
  assert.equal(store.playhead.running, true);
  store.setPlayhead(null);
  assert.equal(store.playhead.running, false);
  assert.deepEqual(store.playhead.voices, [null, null, null]);
});

test('subscribe returns an unsubscribe function, a failing listener does not stop the others', () => {
  const store = createStore(fresh());
  const originalError = console.error;
  console.error = () => {};
  try {
    const seen = [];
    store.subscribe(() => { throw new Error('bad listener'); });
    const off = store.subscribe((c) => seen.push(c.kind));
    store.select({ voice: 2 });
    off();
    store.select({ voice: 1 });
    assert.deepEqual(seen, ['select']);
  } finally {
    console.error = originalError;
  }
});

test('play, stop and auditionNote exist from the start and can be replaced', () => {
  const store = createStore(fresh());
  store.play({ fromCursor: true });
  store.stop();
  store.auditionNote(0, 60);
  let called = null;
  store.auditionNote = (i, p) => { called = [i, p]; };
  store.auditionNote(2, 40);
  assert.deepEqual(called, [2, 40]);
  assert.equal(store.engineReady, false);
  store.setEngineReady(true);
  assert.equal(store.engineReady, true);
});
