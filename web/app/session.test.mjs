// Tests for session.js with a fake engine client and the fake model.
// Run: node --test web/app/session.test.mjs
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.js';
import { createSession } from './session.js';
import { fakeModel, symbols, note, sampleProject } from './fake-model.mjs';
import { SONG_BASE, AUDITION_BASE } from './live.js';

function fakeClient() {
  const calls = [];
  const client = {
    calls, sampleRate: 48000, onState: null, onEnded: null, onError: null,
    load: (writes) => calls.push(['load', writes]),
    start: (address) => calls.push(['start', address]),
    stop: () => calls.push(['stop']),
    edit: (edit) => calls.push(['edit', edit]),
    setModel: (m) => calls.push(['setModel', m]),
    setMuted: (v, b) => calls.push(['setMuted', v, b]),
    setVolume: (x) => calls.push(['setVolume', x]),
  };
  return client;
}

function setup({ problems = [], createFails = false } = {}) {
  const store = createStore(sampleProject());
  const client = fakeClient();
  const events = { problems: [], sizes: [], mode: [], error: [], meter: [] };
  let clock = 1000;
  const model = {
    ...fakeModel,
    validate: () => problems,
    previewSong: (instrument, pitch) => ({ speed: 4, patterns: [{ events: [note(pitch, 2)] }], orders: [[{ pattern: 0, transpose: 0 }], [], []] , instrument }),
  };
  const session = createSession({
    store, model, symbols, nowMs: () => clock,
    createEngineClient: async () => { if (createFails) throw new Error('no audio'); return client; },
    on: {
      problems: (p) => events.problems.push(p), sizes: (s) => events.sizes.push(s), mode: (m) => events.mode.push(m),
      error: (e) => events.error.push(e), meter: (x) => events.meter.push(x),
    },
  });
  return { store, client, events, session, tick: (ms) => { clock += ms; } };
}

const names = (client) => client.calls.map((c) => c[0]);

test('nothing touches the engine before the first play', () => {
  const { store, client, events } = setup();
  store.update('speed', (p) => { p.song.speed = 5; });
  assert.deepEqual(client.calls, []);
  assert.equal(store.engineReady, false);
  assert.ok(events.sizes.length >= 2, 'sizes are reported without an engine');
});

test('play creates the engine, loads everything, starts the song', async () => {
  const { store, client, session, events } = setup();
  await session.play();
  assert.deepEqual(names(client).filter((n) => n !== 'setModel' && n !== 'setVolume'), ['load', 'load', 'start']);
  assert.deepEqual(client.calls.find((c) => c[0] === 'start'), ['start', SONG_BASE]);
  assert.equal(store.engineReady, true);
  assert.equal(session.mode, 'song');
  assert.deepEqual(events.mode, ['song']);
});

test('play from cursor sends the start position after the start', async () => {
  const { store, client, session } = setup();
  store.select({ voice: 0, orderIndex: 1, eventIndex: 1 });
  await session.play({ fromCursor: true });
  const last = client.calls[client.calls.length - 1];
  assert.equal(last[0], 'edit');
  assert.equal(last[1].playhead[0].ticksLeft, 0);
  assert.equal(last[1].playhead[0].orderPos, 2);
  assert.ok(client.calls.findIndex((c) => c[0] === 'start') < client.calls.length - 1);
});

test('edits while playing become engine.edit with small writes', async () => {
  const { store, client, session } = setup();
  await session.play();
  const before = client.calls.length;
  store.update('ad', (p) => { p.instruments[1].ad = 0x11; });
  assert.equal(client.calls.length, before + 1);
  const [name, edit] = client.calls[client.calls.length - 1];
  assert.equal(name, 'edit');
  assert.deepEqual(edit.writes.map((w) => [w.address, [...w.bytes]]), [[0x2101, [0x11]]]);
  store.undo();
  assert.equal(client.calls[client.calls.length - 1][1].writes[0].bytes[0], 0x5A);
});

test('state messages become the store playhead, ended returns to idle', async () => {
  const { store, client, session, tick } = setup();
  await session.play();
  tick(500);
  const map = session.engine && null;
  assert.equal(map, null);
  client.onState({ running: true, frameInTick: 2, peak: 0.5, voices: [
    { orderPos: 0, patAddr: SONG_BASE + 1, patPos: 2, ticksLeft: 1 }, null, null] });
  assert.equal(store.playhead.running, true);
  assert.equal(store.playhead.voices[0].orderIndex, 0);
  client.onEnded();
  assert.equal(session.mode, 'idle');
  assert.equal(store.playhead.running, false);
});

test('an "ended" that arrives right after a start is ignored', async () => {
  const { client, session, tick } = setup();
  await session.play();
  tick(20);
  client.onEnded();
  assert.equal(session.mode, 'song');
});

test('stop stops the engine and clears the playhead', async () => {
  const { store, client, session } = setup();
  await session.play();
  store.stop();
  assert.equal(client.calls[client.calls.length - 1][0], 'stop');
  assert.equal(session.mode, 'idle');
});

test('audition loads the preview at the scratch address and starts it', async () => {
  const { store, client, session } = setup();
  store.auditionNote(1, 40);
  await new Promise((r) => setTimeout(r, 0));
  const start = client.calls.find((c) => c[0] === 'start');
  assert.deepEqual(start, ['start', AUDITION_BASE]);
  const load = client.calls.filter((c) => c[0] === 'load').pop();
  assert.equal(load[1][0].address, AUDITION_BASE);
  assert.equal(session.mode, 'audition');
});

test('a project with problems is not played and not sent', async () => {
  const { store, client, session, events } = setup({ problems: ['pattern 3 is missing'] });
  assert.deepEqual(events.problems[0], ['pattern 3 is missing']);
  await session.play();
  assert.equal(session.mode, 'idle');
  assert.ok(events.error[0].includes('problems'));
  assert.equal(store.engineReady, true, 'the engine itself started fine');
  assert.ok(!names(client).includes('start'));
});

test('an engine that cannot start reports it and can be tried again', async () => {
  const { events, session } = setup({ createFails: true });
  await session.play();
  assert.match(events.error[0], /could not start: no audio/);
  assert.equal(session.mode, 'idle');
  await session.play();
  assert.equal(events.error.length, 2);
});

test('chip model, volume and mutes are applied when the engine appears later', async () => {
  const { client, session } = setup();
  session.setChipModel(1);
  session.setVolume(0.3);
  session.setMuted(2, true);
  await session.play();
  assert.ok(client.calls.some((c) => c[0] === 'setModel' && c[1] === 1));
  assert.ok(client.calls.some((c) => c[0] === 'setVolume' && c[1] === 0.3));
  assert.ok(client.calls.some((c) => c[0] === 'setMuted' && c[1] === 2 && c[2] === true));
});

test('loading a new project stops playback and reloads the engine', async () => {
  const { store, client, session } = setup();
  await session.play();
  const next = sampleProject();
  next.song.name = 'other';
  store.load(next);
  assert.equal(session.mode, 'idle');
  const tail = names(client).slice(-2);
  assert.deepEqual(tail, ['stop', 'load']);
});

test('the engine reporting an error stops and tells the user', async () => {
  const { client, session, events } = setup();
  await session.play();
  client.onError('runaway');
  assert.equal(session.mode, 'idle');
  assert.match(events.error[0], /runaway/);
});
