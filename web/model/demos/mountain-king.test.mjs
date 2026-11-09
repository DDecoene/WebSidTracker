// Checks the Mountain King arrangement against the notes of the score it was made from: valid,
// lint-free, fits, survives serialise/parse, every bar is exactly one bar long in every voice, and
// the opening, the climb, the key changes and the finale are the notes of the source edition.
//
// The expected note lists below were read from the MIDI file of the Mutopia edition (see info.source)
// and checked against the printed score. A note is "name:length", the length in ticks of a 96th note,
// so one bar of 4/4 is 96 ticks, an eighth note 12, a sixteenth 6, a triplet eighth 8.
//
// Run: node --test web/model/demos/mountain-king.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { info, build, BARS, BAR_TICKS } from './mountain-king.js';
import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const project = build();
const { song } = project;

const isTimed = (ev) => ev.type === 'note' || ev.type === 'rest';
const ticksOf = (entry) => song.patterns[entry.pattern].events.reduce((sum, ev) => sum + (isTimed(ev) ? ev.length : 0), 0);

// The notes and rests (as played: transpose included) of one voice over the bars first..last.
function notes(voice, first, last = first) {
  const out = [];
  for (const entry of song.orders[voice].slice(first - 1, last)) {
    for (const ev of song.patterns[entry.pattern].events) {
      if (ev.type === 'note') out.push(`${noteName(ev.pitch + entry.transpose)}:${ev.length}`);
      if (ev.type === 'rest') out.push(`r:${ev.length}`);
    }
  }
  return out.join(' ');
}

test('info names the song and its public domain source', () => {
  assert.equal(info.id, 'mountain-king');
  assert.match(info.title, /Mountain King/);
  assert.match(info.source, /mutopiaproject\.org/);
  assert.match(info.source, /Public Domain/);
  assert.ok(info.note.length > 20);
});

test('the project is valid, lint-free, and fits in memory', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  const size = songSizeInfo(project);
  assert.ok(size.fits);
  assert.ok(size.songBytes < LIMITS.songEnd - LIMITS.songBase);
  assert.equal(song.speed, 1);          // one frame per tick: the grid that holds triplets and grace notes
  assert.equal(BARS, 88);
});

test('serialise then parse gives the same song', () => {
  const bytes = serialiseSong(song, LIMITS.songBase).bytes;
  const back = parseSong(bytes, LIMITS.songBase);
  assert.equal(back.speed, song.speed);
  assert.deepEqual(back.orders, song.orders);
  assert.deepEqual(back.patterns.map((p) => p.events), song.patterns.map((p) => p.events));
});

test('every bar is exactly 96 ticks in every voice, and every voice loops to the start', () => {
  for (const entries of song.orders) {
    assert.equal(entries.length, BARS + 1);
    assert.deepEqual(entries[BARS], { loop: 0 });
    entries.slice(0, BARS).forEach((entry, i) => assert.equal(ticksOf(entry), BAR_TICKS, `bar ${i + 1}`));
  }
});

test('the player limits hold: pattern size, order list size, release, note range', () => {
  const bytes = serialiseSong(song, LIMITS.songBase);
  for (const p of song.patterns) {
    const size = p.events.reduce((sum, ev) => sum + (ev.type === 'note' || ev.type === 'rest' || ev.type === 'inst' ? 2 : 1), 1);
    assert.ok(size <= 255, `${p.name}: ${size} bytes`);
  }
  assert.ok(bytes.size > 0);
  for (const entries of song.orders) assert.ok(entries.length <= 128);
  for (const inst of project.instruments) assert.ok(inst.release >= 1 && inst.release <= 2, inst.name);
  for (const [voice, entries] of song.orders.entries()) {
    for (const entry of entries.slice(0, BARS)) {
      for (const ev of song.patterns[entry.pattern].events) {
        if (ev.type === 'note') assert.ok(ev.pitch + entry.transpose >= 0 && ev.pitch + entry.transpose <= 95, `voice ${voice}`);
      }
    }
  }
});

test('bars 1 to 5: the fermata chord and the first phrase of the theme (melody, B minor)', () => {
  assert.equal(notes(0, 1, 5), [
    'F#4:96',
    'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:24',
    'F-3:12 C#3:12 F-3:24 E-3:12 C-3:12 E-3:24',
    'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:12 B-3:12',
    'A-3:12 F#3:12 D-3:12 F#3:12 A-3:48',
  ].join(' '));
});

test('the bass of the opening: staccato B and F sharp quarters, with the chord note F sharp first', () => {
  assert.equal(notes(1, 1), 'F#3:96');
  assert.equal(notes(1, 2, 3), 'B-1:24 F#2:24 B-1:24 F#2:24 B-1:24 F#2:24 B-1:24 F#2:24');
  assert.equal(notes(2, 1, 8), 'r:96 '.repeat(8).trim());    // the score has two lines here: the third voice rests
});

test('the dominant section (bars 10 to 13) climbs on F sharp over F sharp and C sharp', () => {
  assert.equal(notes(0, 10), 'F#3:12 G#3:12 A#3:12 B-3:12 C#4:12 A#3:12 C#4:24');
  assert.equal(notes(1, 10), 'F#2:24 C#3:24 F#2:24 C#3:24');
});

test('bar 26: the theme reaches the treble, the bass gets its sixteenth figure, the harmony its stabs', () => {
  assert.equal(notes(0, 26), 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:24');
  assert.equal(notes(1, 26), 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12');
  assert.equal(notes(2, 26, 27), 'r:24 D-3:12 r:36 D-3:24 r:24 C#3:24 r:24 C-3:24');
});

test('bars 42 and 48: the triplet bass is 8 ticks to a note and fills the bar exactly', () => {
  assert.equal(notes(1, 42), 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8');
  assert.equal(notes(1, 48), 'B-1:8 F-2:8 F#2:8 B-2:24 A-2:24 G-2:24');
});

test('bars 50 and 58: the loud march and the key change to F sharp', () => {
  assert.equal(notes(0, 50), 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:24');
  assert.equal(notes(1, 50), 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12');
  assert.equal(notes(1, 58), 'F#2:12 E-3:12 D-3:12 C#3:12 F#2:12 E-3:12 D-3:12 C#3:12');
  assert.match(notes(0, 58), /^F#5:12 G#5:12 A#5:12 B-5:12 C#6:12 A#5:12 C#6:24/);
});

test('bar 74: three grace notes run up to the chord on beat 2; bar 88: the final chord', () => {
  assert.equal(notes(0, 74), 'r:15 G#5:3 A-5:3 A#5:3 B-5:24 r:48');
  assert.equal(notes(0, 88), 'r:15 G#5:3 A-5:3 A#5:3 B-5:24 r:48');
  assert.equal(notes(1, 88), 'B-1:24 B-3:24 r:48');
  assert.equal(notes(2, 88), 'r:24 D-3:24 r:48');
  assert.equal(notes(0, 86, 87), 'r:96 r:96');     // the bass alone plays the crescendo of sixteenths
  assert.equal(notes(1, 86), 'r:48 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6');
});

test('the tune climbs: the melody sections start higher and the dynamics build', () => {
  const firstPitch = (voice, bar) => {
    const entry = song.orders[voice][bar - 1];
    const note = song.patterns[entry.pattern].events.find((e) => e.type === 'note');
    return note.pitch + entry.transpose;
  };
  // theme statements in B minor: B2, B3, then again B2, B3, then B3 and B4 once the tune has moved to the treble
  const starts = [2, 6, 18, 22, 26, 30].map((bar) => firstPitch(0, bar));
  assert.deepEqual(starts, [35, 47, 35, 47, 47, 59]);

  const level = (voice, bar) => {
    const entry = song.orders[voice][bar - 1];
    const inst = song.patterns[entry.pattern].events.find((e) => e.type === 'inst').instrument;
    return project.instruments[inst].sr >> 4;
  };
  const dynamics = [2, 18, 26, 34, 42, 50, 66].map((bar) => level(0, bar));
  assert.deepEqual(dynamics, [4, 4, 5, 7, 10, 14, 15]);   // pp, pp, p, crescendo, mf, ff, ff (the quiet triangle gets one step more)
  assert.ok(level(0, 88) === 15 && level(0, 84) < 9);     // pp before the end, ff for the last chord
});

test('vibrato only on long notes, and drums are not used (the score has none)', () => {
  for (const inst of project.instruments) {
    if (inst.vibDepth) assert.ok(inst.vibDelay >= 16, inst.name);
    assert.equal(inst.drumNoise, 0);
  }
});
