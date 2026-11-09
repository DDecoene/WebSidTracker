// Checks the Mountain King arrangement: valid, lint-free, fits, survives serialise/parse, and
// the opening of the theme is the right notes.
//
// Run: node --test web/model/demos/mountain-king.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { info, build } from './mountain-king.js';
import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const project = build();
const { song } = project;

// The notes (name and length in ticks) of voice 2 over its first `count` order entries.
function leadNotes(count) {
  const out = [];
  for (const entry of song.orders[1].slice(0, count)) {
    for (const ev of song.patterns[entry.pattern].events) {
      if (ev.type === 'note') out.push(`${noteName(ev.pitch + entry.transpose)}:${ev.length}`);
      if (ev.type === 'rest') out.push(`r:${ev.length}`);
    }
  }
  return out;
}

test('info describes the song', () => {
  assert.equal(info.id, 'mountain-king');
  assert.match(info.title, /Mountain King/);
  assert.ok(info.note.length > 20);
});

test('the project is valid, lint-free, and fits in memory', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  const size = songSizeInfo(project);
  assert.ok(size.fits);
  assert.ok(size.songBytes < LIMITS.songEnd - LIMITS.songBase);
  assert.equal(song.speed, 5);
});

test('serialise then parse gives the same song', () => {
  const bytes = serialiseSong(song, LIMITS.songBase).bytes;
  const back = parseSong(bytes, LIMITS.songBase);
  assert.equal(back.speed, song.speed);
  assert.deepEqual(back.orders, song.orders);
  assert.deepEqual(back.patterns.map((p) => p.events), song.patterns.map((p) => p.events));
});

test('the theme starts with the right notes: B C# D E F# D F#, then the answering dip', () => {
  // Quiet opening, 4 ticks per eighth note.
  assert.deepEqual(leadNotes(2), [
    'B-3:4', 'C#4:4', 'D-4:4', 'E-4:4', 'F#4:4', 'D-4:4', 'F#4:8',
    'F-4:4', 'C#4:4', 'F-4:8', 'r:16',
  ]);
});

test('the tune speeds up: the same first bar is shorter in each section', () => {
  const firstBarTicks = (entry) => song.patterns[entry.pattern].events
    .reduce((sum, ev) => sum + (ev.type === 'note' || ev.type === 'rest' ? ev.length : 0), 0);
  const lead = song.orders[1];
  const lengths = [0, 4, 8, 16, 24, 28].map((i) => firstBarTicks(lead[i]));
  assert.deepEqual(lengths, [32, 24, 16, 16, 8, 8]);
});

test('all three voices have the same length and loop to the start', () => {
  const totals = song.orders.map((entries) => entries.reduce((sum, e) => {
    if (e.pattern === undefined) return sum;
    return sum + song.patterns[e.pattern].events.reduce((s, ev) => s + (ev.type === 'note' || ev.type === 'rest' ? ev.length : 0), 0);
  }, 0));
  assert.deepEqual(totals, [596, 596, 596]);
  for (const entries of song.orders) assert.deepEqual(entries[entries.length - 1], { loop: 0 });
});

test('drums are on voice 3 from the fifth section on only', () => {
  const drumInstruments = project.instruments.map((inst, n) => (/Kick|Snare|Hat|Crash/.test(inst.name) ? n : -1)).filter((n) => n >= 0);
  const uses = (entry) => entry.pattern !== undefined && song.patterns[entry.pattern].events.some((e) => e.type === 'inst' && drumInstruments.includes(e.instrument));
  const third = song.orders[2];
  const first = third.findIndex(uses);
  assert.ok(first >= 16, `drums start at entry ${first} of ${third.length}`);
  assert.ok(!song.orders[0].some(uses) && !song.orders[1].some(uses));
});
