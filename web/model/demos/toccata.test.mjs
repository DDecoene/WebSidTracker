// Checks the Toccata arrangement: valid and lint-free, fits the song area, survives the byte
// round trip, and plays the notes and the timing of the score it was made from.
//
// The notes come from the public-domain Mutopia score of BWV 565 (see info.source). The checks
// below are the opening phrases of every voice, the length of every section, and a digest of
// every note of every voice (pitch, start tick, length in ticks, instrument). The digests were
// taken from the arrangement after it was compared with the score: 96.5 percent of the 3651
// score notes start on the same tick with the same pitch, and the rest are the inner notes of
// chords that three voices cannot play; see the header of toccata.js for how the reduction goes.
// The digests were taken again when the playing tempo (TEMPO in toccata.js) was added: the notes
// and their order stayed the same, the starts and lengths are now in played ticks, the mordents
// of the opening are legato, and the Ds of the opening and the As of bars 5 and 7 ring into
// their fermatas, the D chord of bar 3 into its rest.
//
// Run: node --test web/model/demos/toccata.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { info, build, barStart, warp } from './toccata.js';
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

// One voice as a list of { pitch, start, length, instrument } (a legato note is its own entry, marked tied),
// in ticks, and the tick at which the voice ends.
function voiceNotes(voice) {
  const { song } = build();
  const notes = [];
  let tick = 0, instrument = 0, tied = false;
  for (const entry of song.orders[voice]) {
    if (entry.stop) break;
    for (const e of song.patterns[entry.pattern].events) {
      if (e.type === 'inst') instrument = e.instrument;
      else if (e.type === 'legato') tied = true;
      else if (e.type === 'note') {
        notes.push({ pitch: e.pitch, start: tick, length: e.length, instrument, ...(tied && { tied }) });
        tick += e.length;
        tied = false;
      }
      else if (e.type === 'rest') tick += e.length;
    }
  }
  return { notes, end: tick };
}

const text = (list) => list.map((n) => `${noteName(n.pitch).replace('-', '')}:${n.length}`).join(' ');

const at = (bar, extra = 0) => Math.round(warp(barStart(bar) + extra));   // the played tick of a score position

test('the bars of the score: bar 4 starts after the opening, the last bar ends where every voice ends', () => {
  assert.equal(barStart(4), 540);
  assert.equal(barStart(28), 2974);
  assert.equal(barStart(130), 16060);
  assert.equal(barStart(144), 18326);
});

test('the opening: the mordent on A as one note with legato, then G F E D C# D, in octaves, the same again lower', () => {
  const lead = text(voiceNotes(0).notes.slice(0, 20));
  assert.equal(lead, 'A5:4 G5:4 A5:92 G5:5 F5:5 E5:5 D5:5 C#5:10 D5:60 A4:4 G4:4 A4:92 E4:10 F4:10 C#4:10 D4:60 A3:4 G3:4 A3:92 G3:5');
  const second = text(voiceNotes(1).notes.slice(0, 12));
  assert.equal(second, 'A4:4 G4:4 A4:92 G4:5 F4:5 E4:5 D4:5 C#4:10 D4:60 A3:4 G3:4 A3:92');
  const { song } = build();
  const first = song.patterns[song.orders[0][0].pattern].events;
  assert.deepEqual(first.slice(1, 6).map((e) => e.type), ['note', 'legato', 'note', 'legato', 'note']);
});

test('the opening is slow: the held A lasts almost two seconds, the first phrase more than five', () => {
  const { notes } = voiceNotes(0);
  assert.equal(notes[2].start + notes[2].length + 10, notes[3].start);          // the A, then a rest of a thirty-second note
  assert.ok(notes[9].start / 50 > 5, 'the second phrase starts after more than five seconds');
  assert.ok(notes[9].start - (notes[8].start + notes[8].length) >= 80, 'the D rings, then a pause with the fermata');
});

test('the pedal enters on the low D of bar 2 and the first run starts on D4 in bar 4', () => {
  const pedal = voiceNotes(2).notes;
  assert.equal(noteName(pedal[0].pitch), 'D-2');
  const run = voiceNotes(0).notes.find((n) => n.start === at(4));
  assert.equal(noteName(run.pitch), 'D-4');
  assert.equal(run.length, 5);                                                   // a triplet sixteenth in the Prestissimo
});

test('the runs keep an even pulse: triplet sixteenths of 5 ticks, thirty-seconds of 4, fugue sixteenths of 10', () => {
  const whole = [];   // a note with the legato notes of the same pitch after it counts as one
  for (const n of voiceNotes(0).notes) {
    const before = whole.at(-1);
    if (n.tied && before && before.pitch === n.pitch) before.length += n.length;
    else whole.push({ ...n });
  }
  const lengths = (from, to) => new Set(whole.filter((n) => n.start >= from && n.start < to).map((n) => n.length));
  assert.ok([...lengths(at(8), at(10))].every((l) => l === 5));
  assert.ok([...lengths(at(13), at(16))].every((l) => l === 8 || l === 4));
  assert.ok([...lengths(at(23), at(27))].every((l) => l === 5));
  assert.ok([...lengths(at(31), at(125))].every((l) => l % 5 === 0), 'every fugue note is a whole number of thirty-seconds');
});

test('the three voices have the same length in ticks, and the sections start together in every voice', () => {
  const ends = [0, 1, 2].map((v) => voiceNotes(v).end);
  assert.deepEqual(ends, [24029, 24029, 24029]);
  assert.equal(ends[0], at(144));
  assert.ok(ends[0] / 50 > 7.5 * 60, 'more than seven and a half minutes');
  const starts = new Set([0, 1, 2].flatMap((v) => voiceNotes(v).notes.map((n) => n.start)));
  for (const bar of [4, 28, 30, 130, 141]) assert.ok(starts.has(at(bar)), `a note starts at bar ${bar}`);
});

test('the final chord: the pedal D low, held to the end', () => {
  const last = (v) => voiceNotes(v).notes.at(-1);
  assert.equal(noteName(last(2).pitch), 'D-2');
  assert.equal(last(2).start + last(2).length, at(144));
  const chord = voiceNotes(2).notes.filter((n) => n.start >= at(143));     // the last bar: one D, longer than 255 ticks, so tied
  assert.ok(chord.every((n) => n.pitch === last(2).pitch) && chord[0].start === at(143) && chord.slice(1).every((n) => n.tied));
});

test('every note of every voice is the one extracted from the score (digest of pitch, start, length, instrument)', () => {
  const digest = (v) => createHash('sha256')
    .update(voiceNotes(v).notes.map((n) => `${n.pitch}@${n.start}+${n.length}/${n.instrument}`).join('\n'))
    .digest('hex').slice(0, 16);
  assert.deepEqual([0, 1, 2].map(digest), ['c2167e9145dd75ad', '51e3bd952293cc6c', '3bba3ec66b7d3bac']);
});
