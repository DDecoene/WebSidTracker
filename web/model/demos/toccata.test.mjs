// Checks the Toccata arrangement: valid and lint-free, fits the song area, survives the byte
// round trip, and starts with the right notes.
//
// Run: node --test web/model/demos/toccata.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { info, build } from './toccata.js';
import { lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

test('info is complete', () => {
  assert.equal(info.id, 'toccata');
  assert.equal(info.title, 'Toccata in D minor');
  assert.ok(info.composer && info.note);
});

test('the project is valid, lint-free and fits', () => {
  const project = build();
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.equal(songSizeInfo(project).fits, true);
  assert.equal(project.song.orders.length, 3);
});

test('serialise and parse give back the same song (names are not stored)', () => {
  const { song } = build();
  const back = parseSong(serialiseSong(song, 0x3000).bytes, 0x3000);
  const plain = (s) => ({ ...s, name: '', patterns: s.patterns.map((p) => ({ ...p, name: '' })) });
  assert.deepEqual(back, plain(song));
});

// The note sequence of one voice's first order entry as "A5:1 G5:1 ...".
function opening(voice, entryIndex = 0) {
  const { song } = build();
  const pattern = song.patterns[song.orders[voice][entryIndex].pattern];
  return pattern.events.filter((e) => e.type !== 'inst').map((e) => (e.type === 'rest' ? `r:${e.length}` : `${noteName(e.pitch).replace('-', '')}:${e.length}`)).join(' ');
}

test('the opening: mordent on A, then G F E D C# D, in octaves', () => {
  assert.equal(opening(0), 'A5:1 G5:1 A5:14 G5:1 F5:1 E5:1 D5:1 C#5:2 D5:12 r:2');
  assert.equal(opening(1), 'A4:1 G4:1 A4:14 G4:1 F4:1 E4:1 D4:1 C#4:2 D4:12 r:2');
  assert.equal(opening(0, 1), 'A4:1 G4:1 A4:14 G4:1 F4:1 E4:1 D4:1 C#4:2 D4:12 r:2');
  assert.equal(opening(2, 1), 'A2:1 G2:1 A2:14 G2:1 F2:1 E2:1 D2:1 C#2:2 D2:12 r:2');
});

test('the three voices have the same length in ticks', () => {
  const { song } = build();
  const total = (list) => list.reduce((sum, e) => sum + (e.pattern === undefined ? 0 : song.patterns[e.pattern].events.reduce((s, ev) => s + (ev.length && ev.type !== 'inst' ? ev.length : 0), 0)), 0);
  const [a, b, c] = song.orders.map(total);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.ok(a * song.speed / 50 > 40, 'longer than 40 seconds');
});
