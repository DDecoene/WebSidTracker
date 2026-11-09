// Tests for editor-logic.js.   Run:  node --test web/ui/editor-logic.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as L from './editor-logic.js';

const note = (pitch, length) => ({ type: 'note', pitch, length });
const rest = (length) => ({ type: 'rest', length });
const inst = (instrument) => ({ type: 'inst', instrument });
const legato = () => ({ type: 'legato' });

// A compact text form of an event list, easy to compare: "i1 C4:2 r3 L C#4:1".
const fmt = (events) => events.map((e) => {
  if (e.type === 'note') return `${L.noteLabel(e.pitch)}:${e.length}`;
  if (e.type === 'rest') return `r${e.length}`;
  if (e.type === 'inst') return `i${e.instrument}`;
  return 'L';
}).join(' ');

test('noteLabel and piano keys', () => {
  assert.equal(L.noteLabel(0), 'C-0');
  assert.equal(L.noteLabel(49), 'C#4');
  assert.equal(L.noteLabel(95), 'B-7');
  assert.equal(L.pianoSemitone('z'), 0);
  assert.equal(L.pianoSemitone('m'), 11);
  assert.equal(L.pianoSemitone('q'), 12);
  assert.equal(L.pianoSemitone('u'), 23);
  assert.equal(L.pianoSemitone('p'), -1);
  assert.equal(L.pianoSemitone(''), -1);
  assert.equal(L.pianoSemitone('Enter'), -1);
});

test('buildLayout: rows, sustain, markers, end row', () => {
  const events = [inst(2), note(48, 3), rest(2), legato(), note(50, 1), inst(5)];
  const lay = L.buildLayout(events);
  assert.equal(lay.total, 6);
  assert.deepEqual(lay.rows.map((r) => r.kind), ['note', 'sustain', 'sustain', 'rest', 'sustain', 'note', 'end']);
  assert.equal(lay.rows[0].inst, 2);
  assert.equal(lay.rows[5].legato, true);
  assert.equal(lay.rows[5].inst, null);
  assert.equal(lay.rows[6].inst, 5);                  // trailing instrument event shows on the end row
  assert.deepEqual(lay.starts, [0, 0, 3, 5, 5, 6, 6]);
  assert.equal(L.eventIndexAtRow(lay, 2), 1);
  assert.equal(L.eventIndexAtRow(lay, 4), 2);
  assert.equal(L.eventIndexAtRow(lay, 99), 6);
  assert.equal(L.rowOfEvent(lay, 4), 5);
  assert.equal(L.patternTicks(events), 6);
});

test('buildLayout: empty pattern has only the end row', () => {
  const lay = L.buildLayout([]);
  assert.equal(lay.total, 0);
  assert.equal(lay.rows.length, 1);
  assert.equal(lay.rows[0].kind, 'end');
});

test('playRow: start of the next event minus the ticks left', () => {
  const lay = L.buildLayout([note(48, 4), note(50, 2)]);
  assert.equal(L.playRow(lay, 1, 4), 0);              // note just started
  assert.equal(L.playRow(lay, 1, 1), 3);
  assert.equal(L.playRow(lay, 2, 2), 4);
  assert.equal(L.playRow(lay, 99, 0), lay.total);
  assert.equal(L.playRow(lay, undefined, 0), -1);
});

test('enter a note on an empty pattern appends and writes the instrument', () => {
  let ev = L.enterNote([], 0, { pitch: 48, length: 1, instrument: 3 });
  assert.equal(fmt(ev), 'i3 C-4:1');
  ev = L.enterNote(ev, 1, { pitch: 50, length: 2, instrument: 3 });
  assert.equal(fmt(ev), 'i3 C-4:1 D-4:2');            // same instrument: no new event
  ev = L.enterNote(ev, 3, { pitch: 52, length: 1, instrument: 4 });
  assert.equal(fmt(ev), 'i3 C-4:1 D-4:2 i4 E-4:1');   // different: an instrument event
});

test('enter a note over a longer note: the rest of it becomes a rest', () => {
  const ev = L.enterNote([inst(1), note(48, 4), note(50, 1)], 0, { pitch: 55, length: 1, instrument: 1 });
  assert.equal(fmt(ev), 'i1 G-4:1 r3 D-4:1');
});

test('enter a note in the middle of a note: the earlier note is cut', () => {
  const ev = L.enterNote([inst(1), note(48, 4)], 2, { pitch: 55, length: 1, instrument: 1 });
  assert.equal(fmt(ev), 'i1 C-4:2 G-4:1 r1');
});

test('enter a long note over several: the covered ones disappear', () => {
  const ev = L.enterNote([inst(1), note(48, 1), note(50, 1), note(52, 1), note(53, 1)], 1, { pitch: 60, length: 2, instrument: 1 });
  assert.equal(fmt(ev), 'i1 C-4:1 C-5:2 F-4:1');
});

test('enter a note over a rest keeps the rest around it', () => {
  const ev = L.enterNote([rest(6)], 2, { pitch: 48, length: 2, instrument: 0 });
  assert.equal(fmt(ev), 'r2 i0 C-4:2 r2');
});

test('enter a note at the end of a pattern that has trailing instrument event', () => {
  const ev = L.enterNote([inst(1), note(48, 1), inst(7)], 1, { pitch: 50, length: 1, instrument: 7 });
  assert.equal(fmt(ev), 'i1 C-4:1 D-4:1');           // 7 was already in force at the end
  const ev2 = L.enterNote([inst(1), note(48, 1), inst(7)], 1, { pitch: 50, length: 1, instrument: 1 });
  assert.equal(fmt(ev2), 'i1 C-4:1 i1 D-4:1');
});

test('a note entered with another instrument does not change the notes after it', () => {
  // notes at rows 0..2 all use instrument 1; change the middle one to 2
  const base = [inst(1), note(48, 1), note(50, 1), note(52, 1)];
  const ev = L.enterNote(base, 1, { pitch: 50, length: 1, instrument: 2 });
  assert.equal(fmt(ev), 'i1 C-4:1 i2 D-4:1 i1 E-4:1');
});

test('replacing the note that carried the instrument event keeps later notes', () => {
  const base = [inst(2), note(48, 1), note(50, 1)];
  const ev = L.enterNote(base, 0, { pitch: 60, length: 1, instrument: 2 });
  assert.equal(fmt(ev), 'i2 C-5:1 D-4:1');
  const ev2 = L.enterRest(base, 0, 1);
  assert.equal(fmt(ev2), 'r1 i2 D-4:1');              // the rest cannot carry it, the next note does
});

test('notes before any instrument event inherit from earlier patterns: never invented', () => {
  const base = [note(48, 1), note(50, 1)];
  const ev = L.enterNote(base, 1, { pitch: 52, length: 1, instrument: 0 });
  assert.equal(fmt(ev), 'C-4:1 i0 E-4:1');
});

test('clearAt turns the whole note into a rest and merges rests', () => {
  assert.equal(fmt(L.clearAt([inst(1), note(48, 3), rest(2), note(50, 1)], 1)), 'r5 i1 D-4:1');
  assert.equal(L.clearAt([rest(3)], 1), null);
  assert.equal(fmt(L.clearAt([note(48, 1), inst(4)], 1)), 'C-4:1');
  assert.equal(L.clearAt([note(48, 1)], 1), null);
});

test('rest entry replaces and merges', () => {
  assert.equal(fmt(L.enterRest([note(48, 2), rest(2)], 1, 1)), 'C-4:1 r3');
  assert.equal(fmt(L.enterRest([], 0, 2)), 'r2');
});

test('setRunLength: note shorter leaves a rest, longer eats rest or pushes', () => {
  const base = [note(48, 3), rest(2), note(50, 1)];
  assert.equal(fmt(L.setRunLength(base, 0, 2)), 'C-4:2 r3 D-4:1');
  assert.equal(fmt(L.setRunLength(base, 0, 4)), 'C-4:4 r1 D-4:1');
  assert.equal(fmt(L.setRunLength(base, 0, 6)), 'C-4:6 D-4:1');
  assert.equal(fmt(L.setRunLength([note(48, 1), note(50, 1)], 0, 2)), 'C-4:2 D-4:1');
  assert.equal(L.setRunLength(base, 0, 3), null);
  assert.equal(fmt(L.setRunLength([note(48, 1)], 0, 300)), 'C-4:255');
});

test('setRunLength on rests inserts / removes ticks', () => {
  const base = [note(48, 1), rest(3), note(50, 1)];
  assert.equal(fmt(L.setRunLength(base, 2, 2)), 'C-4:1 r2 D-4:1');
  assert.equal(fmt(L.setRunLength(base, 1, 5)), 'C-4:1 r5 D-4:1');
  assert.equal(L.setRunLength([rest(1)], 0, 1), null);
});

test('insertRow: before a first tick adds a rest, inside a note adds a tick', () => {
  const base = [note(48, 3), note(50, 1)];
  assert.equal(fmt(L.insertRow(base, 0)), 'r1 C-4:3 D-4:1');
  assert.equal(fmt(L.insertRow(base, 1)), 'C-4:4 D-4:1');
  assert.equal(fmt(L.insertRow(base, 3)), 'C-4:3 r1 D-4:1');
  assert.equal(fmt(L.insertRow(base, 4)), 'C-4:3 D-4:1 r1');
  assert.equal(L.insertRow([note(48, 255)], 1), null);
});

test('deleteRow: first tick of a longer note shortens it, single tick vanishes', () => {
  const base = [inst(1), note(48, 3), note(50, 1), note(52, 2)];
  assert.equal(fmt(L.deleteRow(base, 0)), 'i1 C-4:2 D-4:1 E-4:2');
  assert.equal(fmt(L.deleteRow(base, 2)), 'i1 C-4:2 D-4:1 E-4:2');
  assert.equal(fmt(L.deleteRow(base, 3)), 'i1 C-4:3 E-4:2');
  assert.equal(L.deleteRow(base, 6), null);
});

test('deleteRow of the note that carried the instrument keeps later notes', () => {
  assert.equal(fmt(L.deleteRow([inst(2), note(48, 1), note(50, 1)], 0)), 'i2 D-4:1');
});

test('legato toggles on the head of the note, from any of its rows', () => {
  let ev = L.toggleLegato([note(48, 3)], 2);
  assert.equal(fmt(ev), 'L C-4:3');
  assert.equal(fmt(L.toggleLegato(ev, 0)), 'C-4:3');
  assert.equal(L.toggleLegato([rest(2)], 0), null);
});

test('setNoteInstrument and transposeNote', () => {
  const base = [inst(1), note(48, 1), note(50, 1)];
  assert.equal(fmt(L.setNoteInstrument(base, 1, 3)), 'i1 C-4:1 i3 D-4:1');
  assert.equal(fmt(L.setNoteInstrument(base, 0, 3)), 'i3 C-4:1 i1 D-4:1');
  assert.equal(fmt(L.transposeNote(base, 1, 2)), 'i1 C-4:1 E-4:1');
  assert.equal(L.transposeNote([note(95, 1)], 0, 1), null);
});

test('edits never change the input and keep lengths within 1..255', () => {
  const base = [note(48, 200), rest(100)];
  const copy = JSON.stringify(base);
  const ev = L.setRunLength(base, 0, 255);
  assert.equal(JSON.stringify(base), copy);
  assert.equal(fmt(ev), 'C-4:255 r45');
  const long = L.enterRest([rest(255)], 0, 255);
  assert.equal(fmt(long), 'r255');
  assert.equal(fmt(L.insertRow([rest(255)], 0)), 'r255 r1');
});

test('layout and edit agree: every row index maps to a valid event', () => {
  let ev = [];
  for (let i = 0; i < 40; i++) ev = L.enterNote(ev, L.patternTicks(ev), { pitch: 40 + (i % 12), length: 1 + (i % 3), instrument: i % 5 === 0 ? 2 : 1 });
  const lay = L.buildLayout(ev);
  assert.equal(lay.total, L.patternTicks(ev));
  for (let r = 0; r <= lay.total; r++) assert.ok(L.eventIndexAtRow(lay, r) <= ev.length);
});

// ---- order list and pattern list ---------------------------------------------

function song() {
  return {
    name: 't', speed: 6,
    patterns: [{ name: 'a', events: [note(48, 1)] }, { name: 'b', events: [] }, { name: 'c', events: [] }],
    orders: [
      [{ pattern: 0, transpose: 0 }, { pattern: 2, transpose: 5 }, { loop: 1 }],
      [{ pattern: 2, transpose: 0 }, { stop: true }],
      [],
    ],
  };
}

test('entryLabel', () => {
  assert.equal(L.entryLabel({ pattern: 10, transpose: -3 }), '0A -03');
  assert.equal(L.entryLabel({ pattern: 1, transpose: 12 }), '01 +12');
  assert.equal(L.entryLabel({ stop: true }), 'STOP');
  assert.equal(L.entryLabel({ loop: 2 }), 'LOOP 02');
});

test('patternUsers finds every entry that uses a pattern', () => {
  const s = song();
  assert.deepEqual(L.patternUsers(s, 2), [{ voice: 0, index: 1 }, { voice: 1, index: 0 }]);
  assert.deepEqual(L.patternUsers(s, 1), []);
});

test('removePattern renumbers later patterns', () => {
  const s = song();
  L.removePattern(s, 1);
  assert.equal(s.patterns.length, 2);
  assert.equal(s.orders[0][1].pattern, 1);
  assert.equal(s.orders[1][0].pattern, 1);
});

test('duplicatePattern makes an independent copy', () => {
  const s = song();
  const n = L.duplicatePattern(s, 0);
  assert.equal(n, 3);
  s.patterns[3].events[0].pitch = 60;
  assert.equal(s.patterns[0].events[0].pitch, 48);
  assert.equal(L.duplicatePattern(s, 9), -1);
});

test('addPattern respects the limit', () => {
  const s = song();
  s.patterns = Array.from({ length: L.MAX_PATTERNS }, () => ({ name: '', events: [] }));
  assert.equal(L.addPattern(s), -1);
});

test('insertEntry and deleteEntry keep loop targets right', () => {
  const s = song();
  L.insertEntry(s, 0, 1, { pattern: 1, transpose: 0 });
  assert.equal(s.orders[0][3].loop, 2);                // pointed at old entry 1, now entry 2
  L.deleteEntry(s, 0, 1);
  assert.equal(s.orders[0][2].loop, 1);
  L.deleteEntry(s, 0, 1);                              // the entry the loop pointed at
  assert.equal(s.orders[0][1].loop, 1);                // clamped to the last entry, itself
});

test('assignPattern replaces a pattern entry, inserts before STOP or at the end', () => {
  const s = song();
  assert.equal(L.assignPattern(s, 0, 0, 1), 0);
  assert.equal(s.orders[0][0].pattern, 1);
  assert.equal(L.assignPattern(s, 1, 1, 1), 1);        // was STOP: inserted before it
  assert.deepEqual(s.orders[1].map(L.entryKind), ['pattern', 'pattern', 'stop']);
  assert.equal(L.assignPattern(s, 2, 0, 0), 0);        // empty list
  assert.equal(s.orders[2].length, 1);
});

test('transpose, stop, loop edits', () => {
  const s = song();
  L.setEntryTranspose(s, 0, 0, 200);
  assert.equal(s.orders[0][0].transpose, 96);
  L.setEntryTranspose(s, 0, 2, 5);                     // a loop entry: unchanged
  assert.equal(s.orders[0][2].loop, 1);
  L.setLoopTarget(s, 0, 2, 99);
  assert.equal(s.orders[0][2].loop, 2);
  L.setEntryStop(s, 0, 0);
  assert.deepEqual(s.orders[0][0], { stop: true });
  L.setEntryLoop(s, 0, 0);
  assert.deepEqual(s.orders[0][0], { loop: 0 });
});

test('typeHexDigit slides digits in, only existing patterns', () => {
  assert.equal(L.typeHexDigit(0, 3, 12), 3);
  assert.equal(L.typeHexDigit(1, 0, 20), 0x10);
  assert.equal(L.typeHexDigit(1, 5, 12), 5);           // 0x15 does not exist, 5 does
  assert.equal(L.typeHexDigit(1, 0xF, 4), -1);
});

test('keyHelp lists pairs of strings', () => {
  const help = L.keyHelp();
  assert.ok(help.length > 10);
  for (const [k, d] of help) { assert.equal(typeof k, 'string'); assert.equal(typeof d, 'string'); }
});
