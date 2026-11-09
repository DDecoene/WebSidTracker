// Checks the Für Elise demo: the project is valid and fits, it survives the byte format, and the
// opening melody and the second section are the notes of the piece.
//
// Run: node --test web/model/demos/fur-elise.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { info, build, events } from './fur-elise.js';
import { lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const project = build();
const { song } = project;

// The notes a voice plays in one pass, in order, as names without the dash ("A4", "D#5").
function melody(voice) {
  const names = [];
  for (const entry of song.orders[voice]) {
    if (entry.stop || entry.loop !== undefined) break;
    for (const ev of song.patterns[entry.pattern].events) {
      if (ev.type === 'note') names.push(noteName(ev.pitch + entry.transpose).replace('-', ''));
    }
  }
  return names;
}
const ticks = (voice) => song.orders[voice].filter((e) => e.pattern !== undefined)
  .reduce((sum, e) => sum + song.patterns[e.pattern].events.reduce((a, ev) => a + (ev.length || 0), 0), 0);

test('info', () => {
  assert.equal(info.id, 'fur-elise');
  assert.ok(info.title && info.composer && info.note);
});

test('valid, no warnings, fits', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  for (const pattern of song.patterns) assert.ok(pattern.events.length * 2 + 1 <= 255);
  for (const order of song.orders) assert.ok(order.length <= 128);
  for (const inst of project.instruments) assert.ok(inst.release >= 1 && inst.release <= 32);
});

test('serialise and parse give the same song', () => {
  const { bytes } = serialiseSong(song, 0x3000);
  const back = parseSong(bytes, 0x3000);   // the byte format has no names
  const unnamed = { ...song, name: back.name, patterns: song.patterns.map((p, i) => ({ ...p, name: back.patterns[i].name })) };
  assert.deepEqual(back, unnamed);
});

test('the three voices have the same length and loop to the start', () => {
  assert.equal(ticks(0), 192);
  assert.equal(ticks(1), 192);
  assert.equal(ticks(2), 192);
  for (const order of song.orders) assert.deepEqual(order.at(-1), { loop: 0 });
});

test('no drums', () => {
  assert.ok(project.instruments.every((inst) => !inst.drumNoise));
});

test('the opening is the rondo theme', () => {
  const expected = 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4  C4 E4 A4 B4  E4 G#4 B4 C5  E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4  C4 E4 A4 B4  E4 C5 B4 A4'
    .split(/\s+/);
  assert.deepEqual(melody(0).slice(0, expected.length), expected);
});

test('the second section: F major, C major, then the way back', () => {
  const notes = melody(0).join(' ');
  // The upbeat of the second section is A4 B4 C5 D5 (second ending); then three bars of falling thirds.
  assert.ok(notes.includes('A4 B4 C5 D5 E5 G5 F5 E5 D5 F5 E5 D5 C5 E5 D5 C5 B4 E4 E5 E6'));
});

test('the left hand plays A E A and E G# B', () => {
  const bass = melody(1);
  assert.deepEqual(bass.slice(0, 6), ['A2', 'E3', 'A3', 'E3', 'G#3', 'B3']);
});

test('the note text helper', () => {
  assert.deepEqual(events('i2 E5:3 r:2 l'), [
    { type: 'inst', instrument: 2 }, { type: 'note', pitch: 64, length: 3 }, { type: 'rest', length: 2 }, { type: 'legato' },
  ]);
  assert.throws(() => events('H9:1'));
});
