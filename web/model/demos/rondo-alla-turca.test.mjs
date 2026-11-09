// Checks the Rondo alla Turca arrangement: valid and lint-free, fits the player, survives the byte round
// trip, and plays the notes and the rhythm of the source score (Mutopia Project edition, K. 331 third
// movement, 2/4, with every repeat played).
//
// One tick is one frame and a quarter note is 24 ticks, so a bar is 48 ticks, a sixteenth 6 and a grace
// note 2 or 3. The expected lists below were extracted from the edition's MIDI file by the script that
// made the arrangement (and the notes of the first bars were compared with the printed score).
//
// Run: node --test web/model/demos/rondo-alla-turca.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';
import { build, info, parseNotes } from './rondo-alla-turca.js';

const BAR = 48;
const project = build();
const { song, instruments } = project;

// A voice as a flat list of notes { start, length, pitch, instrument }, in ticks from the start of the song.
function flatten(voice) {
  const notes = [];
  let tick = 0;
  for (const entry of song.orders[voice]) {
    if (entry.pattern === undefined) continue;
    let instrument = 0;
    for (const ev of song.patterns[entry.pattern].events) {
      if (ev.type === 'inst') instrument = ev.instrument;
      else if (ev.type === 'rest') tick += ev.length;
      else if (ev.type === 'note') { notes.push({ start: tick, length: ev.length, pitch: ev.pitch + entry.transpose, instrument }); tick += ev.length; }
    }
  }
  return { notes, ticks: tick };
}
const voices = [0, 1, 2].map(flatten);

// The notes of a voice between two ticks as "C5:6 R:12 ..." (rests written out), the way the arrangement is written.
function text(voice, from, to) {
  const out = [];
  let at = from;
  for (const n of voices[voice].notes) {
    if (n.start < from || n.start >= to) continue;
    if (n.start > at) out.push(`R:${n.start - at}`);
    out.push(`${noteName(n.pitch).replace('-', '')}:${n.length}`);
    at = n.start + n.length;
  }
  return out.join(' ');
}

// Where each section of the performance starts, in ticks: A A B B C C D D E E C C A A B B, the coda,
// its first ending, the coda again, and the second ending with the finish.
const SECTIONS = [
  ['A', 0], ['A', 384], ['B', 768], ['B', 1536], ['C', 2304], ['C', 2688], ['D', 3072], ['D', 3456],
  ['E', 3840], ['E', 4608], ['C', 5376], ['C', 5760], ['A', 6144], ['A', 6528], ['B', 6912], ['B', 7680],
  ['coda', 8448], ['first ending', 8808], ['coda', 8832], ['second ending', 9192],
];
const TOTAL = 10704;

test('info names the movement and credits the score and its licence', () => {
  assert.equal(info.id, 'rondo-alla-turca');
  assert.equal(info.title, 'Rondo alla Turca');
  assert.equal(song.name, 'Rondo alla Turca');
  assert.match(info.composer, /Mozart/);
  assert.ok(info.note.length > 20);
  assert.match(info.source.url, /^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=108$/);
  assert.match(info.source.licence, /Public Domain/);
  assert.match(info.source.editor, /Zedeler/);
});

test('the project is valid, has no warnings and fits the player', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  for (const [n, pattern] of song.patterns.entries()) {
    const bytes = pattern.events.reduce((sum, ev) => sum + (ev.type === 'legato' ? 1 : 2), 1);
    assert.ok(bytes <= LIMITS.maxPatternBytes, `pattern ${n} is ${bytes} bytes`);
  }
  for (const list of song.orders) assert.ok(list.length <= LIMITS.maxEntries);
  for (const inst of instruments) assert.ok(inst.release >= 1 && inst.release <= 2, `${inst.name}: release ${inst.release}`);
  assert.ok(serialiseSong(song, LIMITS.songBase).size < 8000);
  assert.equal(song.speed, 1, 'one tick per frame: a quarter note is 24 frames, 125 per minute');
});

test('serialise then parse gives the same song', () => {
  const bytes = serialiseSong(song, LIMITS.songBase).bytes;
  const back = parseSong(bytes, LIMITS.songBase);
  assert.equal(back.speed, song.speed);
  assert.deepEqual(back.orders, song.orders);
  assert.deepEqual(back.patterns.map((p) => p.events), song.patterns.map((p) => p.events));
});

test('the three voices have the same length: 223 bars of 2/4, every repeat played, then stop', () => {
  assert.deepEqual(voices.map((v) => v.ticks), [TOTAL, TOTAL, TOTAL]);
  assert.equal(TOTAL, 223 * BAR);
  for (const list of song.orders) assert.deepEqual(list[list.length - 1], { stop: true });
});

test('every section starts at the same tick in all three voices, and the repeats are the same notes', () => {
  const lengths = SECTIONS.map(([, tick], i) => (i + 1 < SECTIONS.length ? SECTIONS[i + 1][1] : TOTAL) - tick);
  assert.deepEqual(lengths, [384, 384, 768, 768, 384, 384, 384, 384, 768, 768, 384, 384, 384, 384, 768, 768, 360, 24, 360, 1512]);
  song.orders.forEach((list, voice) => {
    const starts = new Set();
    let tick = 0;
    for (const entry of list) {
      starts.add(tick);
      if (entry.pattern !== undefined) tick += song.patterns[entry.pattern].events.reduce((a, ev) => a + (ev.length || 0), 0);
    }
    for (const [name, at] of SECTIONS) assert.ok(starts.has(at), `voice ${voice + 1}: a pattern starts where section ${name} starts (tick ${at})`);
  });
  // Each repeat is the same music: compare the notes of the two passes, tick by tick relative to the pass.
  const pass = (voice, from, to) => voices[voice].notes.filter((n) => n.start >= from && n.start < to).map((n) => `${n.start - from}:${n.length}:${n.pitch}`).join(' ');
  for (const voice of [0, 1, 2]) {
    for (const [a, b, length] of [[0, 384, 384], [768, 1536, 768], [2304, 2688, 384], [3072, 3456, 384], [3840, 4608, 768], [5376, 5760, 384], [6144, 6528, 384], [6912, 7680, 768]]) {
      assert.equal(pass(voice, a, a + length), pass(voice, b, b + length), `voice ${voice + 1}, ${a} and ${b}`);
    }
    // the coda: 360 ticks played twice, with the half-bar first ending between them
    assert.equal(pass(voice, 8448, 8448 + 342), pass(voice, 8832, 8832 + 342));
  }
});

test('the lead plays the opening of the A minor theme, bars 1 to 8, exactly as in the score', () => {
  // pickup B A G# A; bar 1: C (eighth), rest, D C B C; bar 2: E, rest, F E D# E; bar 3: B A G# A B A G# A;
  // bar 4: C (quarter), A, C; bar 5: B (after the grace pair G A), A, G; ... bar 8: E (quarter).
  assert.equal(text(0, 0, 384),
    'B4:6 A4:6 G#4:6 A4:6 C5:12 R:12 D5:6 C5:6 B4:6 C5:6 E5:12 R:12 F5:6 E5:6 D#5:6 E5:6 B5:6 A5:6 G#5:6 A5:6 ' +
    'B5:6 A5:6 G#5:6 A5:6 C6:24 A5:12 C6:6 G5:3 A5:3 B5:12 A5:12 G5:12 A5:6 G5:3 A5:3 B5:12 A5:12 G5:12 ' +
    'A5:6 G5:3 A5:3 B5:12 A5:12 G5:12 F#5:12 E5:24');
});

test('the C major episode (B), the left hand of the theme and the first chords', () => {
  // top notes of the right hand: E F G G, run A G F E, long D; and again
  assert.equal(text(0, 768, 768 + 192),
    'E5:12 F5:12 G5:12 G5:12 A5:6 G5:6 F5:6 E5:6 D5:24 E5:12 F5:12 G5:12 G5:12 A5:6 G5:6 F5:6 E5:6 D5:24');
  // bass: a quarter of rest (the pickup), then the root on the first eighth of every bar
  assert.equal(text(1, 0, 192), 'R:24 A3:12 R:36 A3:12 R:36 A3:12 R:12 A3:12 R:12 A3:12');
  // chords: the notes above it on the other eighths (C and E as one arpeggio note on C4)
  assert.equal(text(2, 0, 96), 'R:36 C4:12 C4:12 C4:12 R:12 C4:12');
  for (const n of voices[2].notes.slice(0, 4)) assert.equal(instruments[n.instrument].arp, 4);   // C to E is 4 semitones
});

test('A major, strummed: grace notes come just before the beat and take their time from the note before', () => {
  // coda, bar 1 of the left hand: rest of the pickup, the strum A C# E (2 ticks each) into the A, ...
  assert.equal(text(1, 8448, 8448 + 96), 'R:18 A2:2 C#3:2 E3:2 A3:12 A3:12 A3:12 A3:6 A2:2 C#3:2 E3:2 A3:12 A3:12');
  // the lead's grace pair G A (3 ticks each) leads into the B of bar 5, so the C before it has 6 of its 12 ticks
  assert.equal(text(0, 168, 240), 'C6:24 A5:12 C6:6 G5:3 A5:3 B5:12 A5:12');
});

test('the closing bars: A major chords and a stop', () => {
  assert.equal(text(0, TOTAL - 120, TOTAL), 'A5:12 C#6:12 A5:12 E6:12 A5:24 A5:24 A5:24');
  assert.equal(text(1, TOTAL - 120, TOTAL), 'A3:12 A3:6 A2:2 C#3:2 E3:2 A3:12 A3:12 A2:24 A2:24 A2:24');
  assert.equal(text(2, TOTAL - 120, TOTAL), 'R:72 C#3:24 C#3:24');
});

test('the notes and rhythm of every voice are those of the source (checksum of start, length, pitch)', () => {
  // If you change the arrangement on purpose, print these with the same formula and update them.
  const sum = (voice) => createHash('sha1').update(voices[voice].notes.map((n) => `${n.start}:${n.length}:${n.pitch}`).join(';')).digest('hex').slice(0, 12);
  assert.deepEqual(voices.map((v) => v.notes.length), [1172, 775, 272]);
  assert.deepEqual([0, 1, 2].map(sum), ['8498145d3a96', 'eb91e04ae9e9', 'b487e7b25ea4']);
});

test('sound design: the lead is the loudest, pulse widths and vibrato are in range, arpeggios only in chords', () => {
  const lead = instruments[voices[0].notes[0].instrument];
  assert.equal(lead.wave, 0x40);
  assert.ok(lead.pw >= 0x666 && lead.pw <= 0x999, 'start width 40 to 60 percent');
  assert.ok(lead.pwMin * 16 >= 0x666 && lead.pwMax * 16 <= 0x999, 'the sweep stays in 40 to 60 percent');
  assert.ok(lead.vibDelay >= 10, 'vibrato only on long notes');
  assert.equal(lead.sr >> 4, 15);
  const used = (voice) => new Set(voices[voice].notes.map((n) => n.instrument));
  assert.deepEqual([...used(0)], [0]);
  for (const i of used(1)) { assert.equal(instruments[i].arp, 0); assert.equal(instruments[i].vibDepth, 0); assert.ok(instruments[i].sr >> 4 < 15); }
  for (const i of used(2)) { assert.ok(instruments[i].arp > 0); assert.ok(instruments[i].sr >> 4 < 15); }
  for (const inst of instruments) assert.equal(inst.drumNoise, 0, 'no drums');
});

test('the bass and the chords stay below the lead, and the whole range is one the SID plays', () => {
  const at = (voice) => { const row = new Int16Array(TOTAL).fill(-1); for (const n of voices[voice].notes) row.fill(n.pitch + instruments[n.instrument].arp, n.start, n.start + n.length); return row; };
  const [lead, bass, chord] = [0, 1, 2].map(at);
  let above = 0;
  for (let t = 0; t < TOTAL; t++) if (lead[t] >= 0 && ((bass[t] >= 0 && bass[t] >= lead[t]) || (chord[t] >= 0 && chord[t] >= lead[t]))) above++;
  assert.equal(above, 0);
  const pitches = voices.flatMap((v) => v.notes.map((n) => n.pitch));
  assert.ok(Math.min(...pitches) >= 26 && Math.max(...pitches) <= 88);
});

test('parseNotes reads notes, rests and instrument changes, and refuses nonsense', () => {
  assert.deepEqual(parseNotes('i2 A4:3 R:1'), [{ type: 'inst', instrument: 2 }, { type: 'note', pitch: 57, length: 3 }, { type: 'rest', length: 1 }]);
  assert.throws(() => parseNotes('H9:1'), /bad note/);
});
