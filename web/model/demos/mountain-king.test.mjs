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

import { info, build, BARS, BAR_TICKS, EIGHTH } from './mountain-king.js';
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

// Frames per eighth note in a bar, and a bar of the score ("B-2:12 r:24", lengths in score ticks,
// 12 to an eighth) at the tempo of that bar.
const eighthOf = (bar) => EIGHTH.reduce((value, [first, v]) => (bar >= first ? v : value), EIGHTH[0][1]);
const atTempo = (bar, text) => text.split(' ').map((w) => w.replace(/:(\d+)$/, (_, n) => `:${Number(n) * eighthOf(bar) / 12}`)).join(' ');
const barsAtTempo = (first, texts) => texts.map((t, k) => atTempo(first + k, t)).join(' ');

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

test('every bar has the length of its tempo in every voice (8 eighths), and every voice loops to the start', () => {
  for (const entries of song.orders) {
    assert.equal(entries.length, BARS + 1);
    assert.deepEqual(entries[BARS], { loop: 0 });
    entries.slice(0, BARS).forEach((entry, i) => assert.equal(ticksOf(entry), BAR_TICKS / 12 * eighthOf(i + 1), `bar ${i + 1}`));
  }
});

test('the accelerando: the eighth gets shorter step by step, from 12 frames (a quarter of 125) to 6 (250)', () => {
  const steps = EIGHTH.slice(1).map(([, frames]) => frames);
  assert.equal(steps[0], 12);
  assert.equal(steps.at(-1), 6);
  steps.slice(1).forEach((frames, k) => assert.ok(frames < steps[k]));
  assert.equal(eighthOf(50), 8);                                   // Più vivo
  assert.ok(eighthOf(58) <= 8 && eighthOf(88) < eighthOf(58));    // sempre stretto sin al fine
  const seconds = song.orders[0].slice(0, BARS).reduce((sum, entry) => sum + ticksOf(entry), 0) / 50;
  assert.ok(seconds > 120 && seconds < 150, `${seconds} seconds`);
});

test('staccato: an eighth sounds a little over half its length, a held half note almost all of it', () => {
  const firstNote = (bar) => {
    const events = song.patterns[song.orders[0][bar - 1].pattern].events;
    let inst = 0;
    for (const ev of events) {
      if (ev.type === 'inst') inst = ev.instrument;
      if (ev.type === 'note') return { length: ev.length, release: project.instruments[inst].release };
    }
  };
  const eighth = firstNote(2);
  assert.equal(eighth.length, 12);
  assert.ok(eighth.release >= 4 && eighth.release <= 6);
  const half = song.patterns[song.orders[0][4].pattern].events.filter((e) => e.type === 'note').at(-1);   // the A of bar 5
  assert.equal(half.length, 48);
});

test('the player limits hold: pattern size, order list size, release, note range', () => {
  const bytes = serialiseSong(song, LIMITS.songBase);
  for (const p of song.patterns) {
    const size = p.events.reduce((sum, ev) => sum + (ev.type === 'note' || ev.type === 'rest' || ev.type === 'inst' ? 2 : 1), 1);
    assert.ok(size <= 255, `${p.name}: ${size} bytes`);
  }
  assert.ok(bytes.size > 0);
  for (const entries of song.orders) assert.ok(entries.length <= 128);
  for (const inst of project.instruments) {
    assert.ok(inst.release >= 1 && inst.release <= 32, inst.name);
    if (inst.release === 1) assert.equal(inst.ad & 0x0F, 0, `${inst.name}: a release of 1 frame needs decay 0`);
  }
  for (const [voice, entries] of song.orders.entries()) {
    for (const entry of entries.slice(0, BARS)) {
      for (const ev of song.patterns[entry.pattern].events) {
        if (ev.type === 'note') assert.ok(ev.pitch + entry.transpose >= 0 && ev.pitch + entry.transpose <= 95, `voice ${voice}`);
      }
    }
  }
});

test('bars 1 to 5: the fermata chord and the first phrase of the theme (melody, B minor)', () => {
  assert.equal(notes(0, 1, 5), barsAtTempo(1, [
    'F#4:96',
    'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:24',
    'F-3:12 C#3:12 F-3:24 E-3:12 C-3:12 E-3:24',
    'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:12 B-3:12',
    'A-3:12 F#3:12 D-3:12 F#3:12 A-3:48',
  ]));
});

test('the bass of the opening: staccato B and F sharp quarters, with the chord note F sharp first', () => {
  assert.equal(notes(1, 1), atTempo(1, 'F#3:96'));
  assert.equal(notes(1, 2, 3), atTempo(2, 'B-1:24 F#2:24 B-1:24 F#2:24 B-1:24 F#2:24 B-1:24 F#2:24'));
  assert.equal(notes(2, 1, 8), barsAtTempo(1, Array(8).fill('r:96')));    // the score has two lines here: the third voice rests
});

test('the dominant section (bars 10 to 13) climbs on F sharp over F sharp and C sharp', () => {
  assert.equal(notes(0, 10), atTempo(10, 'F#3:12 G#3:12 A#3:12 B-3:12 C#4:12 A#3:12 C#4:24'));
  assert.equal(notes(1, 10), atTempo(10, 'F#2:24 C#3:24 F#2:24 C#3:24'));
});

test('bar 26: the theme reaches the treble, the bass gets its sixteenth figure, the harmony its stabs', () => {
  assert.equal(notes(0, 26), atTempo(26, 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:24'));
  assert.equal(notes(1, 26), atTempo(26, 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12'));
  assert.equal(notes(2, 26, 27), atTempo(26, 'r:24 D-3:12 r:36 D-3:24 r:24 C#3:24 r:24 C-3:24'));
});

test('bars 42 and 48: the triplet bass is 8 score ticks (6 frames) to a note and fills the bar exactly', () => {
  assert.equal(notes(1, 42), atTempo(42, 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8'));
  assert.equal(notes(1, 48), atTempo(48, 'B-1:8 F-2:8 F#2:8 B-2:24 A-2:24 G-2:24'));
});

test('bars 50 and 58: the loud march and the key change to F sharp', () => {
  assert.equal(notes(0, 50), atTempo(50, 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:24'));
  assert.equal(notes(1, 50), atTempo(50, 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12'));
  assert.equal(notes(1, 58), atTempo(58, 'F#2:12 E-3:12 D-3:12 C#3:12 F#2:12 E-3:12 D-3:12 C#3:12'));
  assert.ok(notes(0, 58).startsWith(atTempo(58, 'F#5:12 G#5:12 A#5:12 B-5:12 C#6:12 A#5:12 C#6:24')));
});

test('bar 74: three grace notes of 2 frames run up legato to the chord on beat 2; bar 88: the final chord', () => {
  assert.equal(notes(0, 74), 'r:6 G#5:2 A-5:2 A#5:2 B-5:12 r:24');     // the rest before them gives up their frames
  const events = song.patterns[song.orders[0][73].pattern].events.filter((e) => e.type !== 'inst').map((e) => e.type);
  assert.deepEqual(events, ['rest', 'note', 'legato', 'note', 'legato', 'note', 'legato', 'note', 'rest']);
  assert.equal(notes(0, 88), 'r:6 G#5:2 A-5:2 A#5:2 B-5:12 r:24');
  assert.equal(notes(1, 88), atTempo(88, 'B-1:24 B-3:24 r:48'));
  assert.equal(notes(2, 88), atTempo(88, 'r:24 D-3:24 r:48'));
  assert.equal(notes(0, 86, 87), barsAtTempo(86, ['r:96', 'r:96']));     // the bass alone plays the crescendo of sixteenths
  assert.equal(notes(1, 86), atTempo(86, 'r:48 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6'));
});

test('the chord stabs are three-note chords where the harmony is plain', () => {
  const stab = (bar) => {
    const events = song.patterns[song.orders[2][bar - 1].pattern].events;
    const inst = project.instruments[events.find((e) => e.type === 'inst').instrument];
    return [inst.arp, inst.arp2];
  };
  assert.deepEqual(stab(34), [3, 8]);    // A# C# F#: F sharp major
  assert.deepEqual(stab(26), [4, 9]);    // D F# B: B minor
  assert.deepEqual(stab(74), [3, 6]);    // E# G# B: the diminished chord
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
