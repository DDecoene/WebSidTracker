// Checks the Toccata arrangement: valid and lint-free, fits the song area, survives the byte
// round trip, and plays the notes and the timing of the score it was made from.
//
// The notes come from the public-domain Mutopia score of BWV 565 (see info.source). The checks
// below are the opening phrases of every voice, the length of every section, and a digest of
// every note of every voice (pitch, start tick, length in ticks, instrument). The digests were
// taken from the arrangement after it was compared with the score: 96.5 percent of the 3651
// score notes start on the same tick with the same pitch, and the rest are the inner notes of
// chords that three voices cannot play; see the header of toccata.js for how the reduction goes.
//
// Run: node --test web/model/demos/toccata.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { info, build } from './toccata.js';
import { lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

test('info is complete and credits the score', () => {
  assert.equal(info.id, 'toccata');
  assert.equal(info.title, 'Toccata in D minor');
  assert.ok(info.composer && info.note);
  assert.match(info.source, /Mutopia/);
  assert.match(info.source, /public domain/);
  assert.equal(build().song.name, 'Toccata in D minor');
});

test('the project is valid, lint-free and fits', () => {
  const project = build();
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.equal(songSizeInfo(project).fits, true);
  assert.equal(project.song.orders.length, 3);
  assert.equal(project.song.speed, 1);
});

test('the player limits are kept: patterns of at most 255 bytes, order lists of at most 128 entries', () => {
  const { song } = build();
  const size = (e) => (e.type === 'legato' ? 1 : 2);
  for (const pattern of song.patterns) {
    assert.ok(pattern.events.reduce((sum, e) => sum + size(e), 1) <= 255, pattern.name);
  }
  for (const order of song.orders) assert.ok(order.length <= 128);
  for (const e of build().instruments.filter(Boolean)) assert.ok(e.release >= 1 && e.release <= 2, e.name);
});

test('serialise and parse give back the same song (names are not stored)', () => {
  const { song } = build();
  const back = parseSong(serialiseSong(song, 0x3000).bytes, 0x3000);
  const plain = (s) => ({ ...s, name: '', patterns: s.patterns.map((p) => ({ ...p, name: '' })) });
  assert.deepEqual(back, plain(song));
});

// One voice as a list of { pitch, start, length, instrument } (a legato note is its own entry),
// in ticks, and the tick at which the voice ends.
function voiceNotes(voice) {
  const { song } = build();
  const notes = [];
  let tick = 0, instrument = 0;
  for (const entry of song.orders[voice]) {
    if (entry.stop) break;
    for (const e of song.patterns[entry.pattern].events) {
      if (e.type === 'inst') instrument = e.instrument;
      else if (e.type === 'note') { notes.push({ pitch: e.pitch, start: tick, length: e.length, instrument }); tick += e.length; }
      else if (e.type === 'rest') tick += e.length;
    }
  }
  return { notes, end: tick };
}

const text = (list) => list.map((n) => `${noteName(n.pitch).replace('-', '')}:${n.length}`).join(' ');

test('the opening: the mordent on A, then G F E D C# D, in octaves, the same again lower', () => {
  const lead = text(voiceNotes(0).notes.slice(0, 20));
  assert.equal(lead, 'A5:2 G5:2 A5:36 G5:2 F5:2 E5:2 D5:2 C#5:4 D5:8 A4:2 G4:2 A4:36 E4:4 F4:4 C#4:4 D4:8 A3:2 G3:2 A3:36 G3:2');
  const second = text(voiceNotes(1).notes.slice(0, 12));
  assert.equal(second, 'A4:2 G4:2 A4:36 G4:2 F4:2 E4:2 D4:2 C#4:4 D4:8 A3:2 G3:2 A3:36');
});

test('the opening has the rests of the score: 4 ticks of silence after the held A, the fermata pause after the phrase', () => {
  const { notes } = voiceNotes(0);
  assert.equal(notes[2].start + notes[2].length + 4, notes[3].start);           // A held 36 ticks, then a rest of 4
  const phrase = notes[8];                                                      // the D that ends the first phrase
  assert.equal(notes[9].start - (phrase.start + phrase.length), 54);            // the rest with the fermata (24 + 30)
});

test('the pedal enters on the low D of bar 2 and the first run starts on D4 in bar 4', () => {
  const pedal = voiceNotes(2).notes;
  assert.equal(noteName(pedal[0].pitch), 'D-2');
  assert.equal(pedal[0].length, 128);
  const run = voiceNotes(0).notes.find((n) => n.start === 540);
  assert.equal(noteName(run.pitch), 'D-4');
  assert.equal(run.length, 4);                                                   // a triplet sixteenth in the Prestissimo
});

test('the three voices have the same length in ticks, and the sections have the length of the score', () => {
  const ends = [0, 1, 2].map((v) => voiceNotes(v).end);
  assert.deepEqual(ends, [18326, 18326, 18326]);
  assert.ok(ends[0] / 50 > 360, 'more than six minutes');
  // the tick at which each section starts: bars 4, 28, 130, 133, 141 (the first note of the lead or of the pedal)
  const starts = new Set([0, 1, 2].flatMap((v) => voiceNotes(v).notes.map((n) => n.start)));
  for (const tick of [540, 2974, 16060, 16636, 17690]) assert.ok(starts.has(tick), `a note starts at tick ${tick}`);
});

test('the final chord: the pedal D low, held 252 ticks to the end', () => {
  const last = (v) => voiceNotes(v).notes.at(-1);
  assert.equal(noteName(last(2).pitch), 'D-2');
  assert.equal(last(2).start + last(2).length, 18326);
  assert.equal(last(2).length, 252);
});

test('every note of every voice is the one extracted from the score (digest of pitch, start, length, instrument)', () => {
  const digest = (v) => createHash('sha256')
    .update(voiceNotes(v).notes.map((n) => `${n.pitch}@${n.start}+${n.length}/${n.instrument}`).join('\n'))
    .digest('hex').slice(0, 16);
  assert.deepEqual([0, 1, 2].map(digest), ['27b943afaa667d9e', 'dadab7ffb22ad199', 'e7b820a52461f41e']);
});
