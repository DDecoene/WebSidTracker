// Checks the Rondo alla Turca arrangement: valid and lint-free, fits the player's limits, survives the
// byte round trip, and the opening of the tune is the expected one.
//
// Run: node --test web/model/demos/rondo-alla-turca.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';
import { build, info, parseNotes } from './rondo-alla-turca.js';

const project = build();
const ticksOf = (voice) => project.song.orders[voice].reduce((sum, entry) => sum + (entry.pattern === undefined ? 0
  : project.song.patterns[entry.pattern].events.reduce((a, ev) => a + (ev.length || 0), 0)), 0);

test('info describes the piece', () => {
  assert.equal(info.id, 'rondo-alla-turca');
  assert.equal(info.title, 'Rondo alla Turca');
  assert.match(info.composer, /Mozart/);
  assert.ok(info.note.length > 20);
});

test('the project is valid and has no lint warnings', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
});

test('it fits the player: pattern and order list sizes, release, memory', () => {
  for (const [n, pattern] of project.song.patterns.entries()) {
    const bytes = pattern.events.reduce((sum, ev) => sum + (ev.type === 'legato' ? 1 : 2), 1);
    assert.ok(bytes <= LIMITS.maxPatternBytes, `pattern ${n} is ${bytes} bytes`);
  }
  for (const list of project.song.orders) assert.ok(list.length <= LIMITS.maxEntries);
  for (const inst of project.instruments) assert.ok(inst.release >= 1 && inst.release <= 32);
  assert.ok(songSizeInfo(project).fits);
});

test('serialise then parse gives the same song', () => {
  const bytes = serialiseSong(project.song, LIMITS.songBase).bytes;
  const back = parseSong(bytes, LIMITS.songBase);
  const stripped = { ...project.song, name: '', patterns: project.song.patterns.map((p) => ({ ...p, name: '' })) };
  assert.deepEqual(back, stripped);
});

test('the three voices are equally long and loop to the start', () => {
  assert.deepEqual([ticksOf(0), ticksOf(1), ticksOf(2)], [512, 512, 512]);   // 64 bars of 8 ticks
  for (const list of project.song.orders) assert.deepEqual(list[list.length - 1], { loop: 0 });
});

test('the opening melody is B A G# A C | D C B C E | F E D# E B A G# A', () => {
  const lead = project.song.patterns[project.song.orders[0][0].pattern].events;
  const notes = lead.filter((ev) => ev.type === 'note').slice(0, 21);
  assert.deepEqual(notes.map((ev) => noteName(ev.pitch)),
    ['B-4', 'A-4', 'G#4', 'A-4', 'C-5', 'D-5', 'C-5', 'B-4', 'C-5', 'E-5', 'F-5', 'E-5', 'D#5', 'E-5', 'B-5', 'A-5', 'G#5', 'A-5', 'B-5', 'A-5', 'G#5']);
  assert.deepEqual(notes.slice(0, 5).map((ev) => ev.length), [1, 1, 1, 1, 4]);
  assert.equal(project.song.speed, 5);
});

test('the sections are in A minor, A major and C major, and bars are 8 ticks', () => {
  const bars = (name) => {
    const pattern = project.song.patterns.find((p) => p.name === name);
    const total = pattern.events.reduce((a, ev) => a + (ev.length || 0), 0);
    return { pattern, total };
  };
  for (const name of ['theme', 'A major', 'C major']) assert.equal(bars(name).total, 64, name);
  const lastNote = (name) => { const ev = bars(name).pattern.events.filter((e) => e.type === 'note'); return noteName(ev[ev.length - 1].pitch); };
  assert.equal(lastNote('theme'), 'A-4');
  assert.equal(lastNote('A major'), 'A-5');
  assert.equal(lastNote('C major'), 'C-6');
});

test('parseNotes reads notes, rests and instrument changes, and refuses nonsense', () => {
  assert.deepEqual(parseNotes('i2 A4:3 R:1'), [{ type: 'inst', instrument: 2 }, { type: 'note', pitch: 57, length: 3 }, { type: 'rest', length: 1 }]);
  assert.throws(() => parseNotes('H9:1'), /bad note/);
});
