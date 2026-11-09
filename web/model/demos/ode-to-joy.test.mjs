// Checks the "Ode to Joy" demo: valid and lint-free, fits the player, survives the byte round trip, and
// plays the notes and rhythm of the source score (Mutopia Project edition, G major, 16 bars of 4/4).
//
// One tick is a third of a quarter note, so a bar is 24 ticks and a quarter is 6 ticks. The expected lists
// below were extracted from the score's LilyPond text (and checked against its MIDI file).
//
// Run: node --test web/model/demos/ode-to-joy.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { build, info } from './ode-to-joy.js';
import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const BAR = 24;
const events = (project, pattern) => project.song.patterns[pattern].events;
const notesOf = (project, entry) => events(project, entry.pattern).filter((ev) => ev.type === 'note');
const text = (list) => list.map((ev) => `${noteName(ev.pitch).replace('-', '')}:${ev.length}`).join(' ');
const ticksOf = (list) => list.reduce((sum, ev) => sum + ev.length, 0);

// Phrase 1 (bars 1-4) of each part, as in the score: soprano, alto, tenor, bass.
const SOPRANO_1 = 'B4:6 B4:6 C5:6 D5:6 D5:6 C5:6 B4:6 A4:6 G4:6 G4:6 A4:6 B4:6 B4:9 A4:3 A4:12';
const ALTO_1 = 'G4:6 G4:6 A4:6 G4:6 G4:9 A4:3 G4:6 F#4:6 D4:6 D4:6 F#4:6 G4:6 G4:9 F#4:3 F#4:12';
const BASS_1 = 'G3:6 G3:6 G3:6 G3:6 E3:9 F#3:3 G3:6 D3:6 B3:6 B3:6 A3:6 G3:6 D3:9 D3:3 D3:12';
// Phrase 3, the bridge of the tune (bars 9-12), soprano.
const SOPRANO_3 = 'A4:6 A4:6 B4:6 G4:6 A4:6 B4:3 C5:3 B4:6 G4:6 A4:6 B4:3 C5:3 B4:6 A4:6 G4:6 A4:6 D4:12';
// Round 2 of the inner voice, phrase 1: tenor and alto alternate in eighth notes (3 ticks).
const CHORDS_1 = 'D4:3 G4:3 D4:3 G4:3 C4:3 A4:3 B3:3 G4:3 E4:3 G4:3 E4:3 A4:3 D4:3 G4:3 D4:3 F#4:3 B3:3 D4:3 B3:3 D4:6 F#4:3 D4:3 G4:3 D4:3 G4:3 D4:3 F#4:3 D4:3 F#4:3 D4:3 F#4:3';

test('info names the demo and credits the score', () => {
  assert.equal(info.id, 'ode-to-joy');
  assert.equal(info.title, 'Ode to Joy');
  assert.ok(info.composer.includes('Beethoven') && info.note.length > 20);
  assert.match(info.source.url, /^https:\/\/www\.mutopiaproject\.org\//);
  assert.match(info.source.licence, /Public Domain/);
  assert.match(info.source.editor, /Chubb/);
});

test('the project is valid, has no warnings and fits the player', () => {
  const project = build();
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  assert.ok(serialiseSong(project.song).size < 2000);
  project.song.orders.forEach((list) => assert.ok(list.length <= LIMITS.maxEntries));
  project.song.patterns.forEach((p, n) => assert.ok(p.events.length * 2 + 1 <= 255, `pattern ${n} fits 255 bytes`));
  assert.equal(project.song.speed, 5, 'speed 5 = 30 frames per quarter = 100 beats per minute (the score tempo)');
});

test('serialise and parse give the same song back', () => {
  const project = build();
  const bytes = serialiseSong(project.song, LIMITS.songBase);
  const back = parseSong(bytes.bytes, LIMITS.songBase);   // pattern and song names are not stored in the bytes
  assert.equal(back.speed, project.song.speed);
  assert.deepEqual(back.orders, project.song.orders);
  assert.deepEqual(back.patterns.map((p) => p.events), project.song.patterns.map((p) => p.events));
});

test('the first phrase of every part matches the score, note for note and tick for tick', () => {
  const project = build();
  const [lead, inner, bass] = project.song.orders;
  assert.equal(text(notesOf(project, lead[0])), SOPRANO_1);
  assert.equal(text(notesOf(project, inner[0])), ALTO_1);
  assert.equal(text(notesOf(project, bass[0])), BASS_1);
  assert.equal(text(notesOf(project, lead[2])), SOPRANO_3, 'the bridge, ending on the low D');
  assert.equal(text(notesOf(project, inner[4])), CHORDS_1, 'round 2: tenor and alto in alternation');
});

test('every note value is a whole number of ticks and every bar adds up to 24 ticks', () => {
  const project = build();
  project.song.orders.forEach((list, v) => {
    list.filter((e) => e.pattern !== undefined).forEach((entry, i) => {
      const notes = notesOf(project, entry);
      notes.forEach((ev) => assert.ok(Number.isInteger(ev.length) && ev.length >= 3, `voice ${v + 1} entry ${i}`));
      assert.equal(ticksOf(notes), 4 * BAR, `voice ${v + 1} phrase ${i}`);
    });
  });
});

test('structure: 4 phrases x 2 rounds, 768 ticks per voice, all loop to the start, the lead goes up an octave', () => {
  const project = build();
  project.song.orders.forEach((list, v) => {
    assert.equal(list.length, 9, `voice ${v + 1}: 8 phrases and a loop`);
    assert.deepEqual(list.at(-1), { loop: 0 });
    const total = list.filter((e) => e.pattern !== undefined).reduce((sum, e) => sum + ticksOf(notesOf(project, e)), 0);
    assert.equal(total, 2 * 16 * BAR, `voice ${v + 1}`);
  });
  const lead = project.song.orders[0];
  assert.deepEqual(lead.slice(0, 4).map((e) => e.transpose), [0, 0, 0, 0]);
  assert.deepEqual(lead.slice(4, 8).map((e) => e.transpose), [12, 12, 12, 12]);
  assert.equal(lead[3].pattern, lead[1].pattern, 'bars 13-16 repeat bars 5-8 in the tune');
});

test('the voices are balanced: the lead has the highest sustain, the bass stays below the other parts', () => {
  const project = build();
  const sustain = (voice) => {
    const entry = project.song.orders[voice][0];
    const first = events(project, entry.pattern).find((ev) => ev.type === 'inst');
    return project.instruments[first.instrument].sr >> 4;
  };
  assert.ok(sustain(0) > sustain(1) && sustain(0) >= sustain(2));
  const lowest = (voice) => Math.min(...project.song.orders[voice].filter((e) => e.pattern !== undefined)
    .flatMap((e) => notesOf(project, e).map((ev) => ev.pitch + e.transpose)));
  const highest = (voice) => Math.max(...project.song.orders[voice].filter((e) => e.pattern !== undefined)
    .flatMap((e) => notesOf(project, e).map((ev) => ev.pitch + e.transpose)));
  assert.ok(highest(2) < lowest(0));
});
