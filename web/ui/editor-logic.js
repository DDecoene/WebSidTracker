// editor-logic.js - the pure part of the pattern editor: no DOM, no store.
//
// A pattern is stored as a stream of events (note, rest, instrument, legato),
// see docs/design-player-format-and-timing.md section 4.4. The editor shows it
// as a grid with one row per tick. This file holds
//   1. buildLayout: event list -> grid rows (and back: row -> event index),
//   2. the edits, one function per key. Each takes an event list and a row and
//      returns a NEW event list (or null when nothing would change),
//   3. the order list and pattern list edits (these change a song in place and
//      are meant to run inside store.update),
//   4. questions the Patterns panel asks (who uses a pattern, which are unused) and
//      the small value rules of the order list controls (transpose text, fields).
//
// How the edits work: an event list is first unpacked into a "timeline", one
// cell per tick:
//     { pitch: 0..95 | -1 (rest), inst?: n, leg?: true }   first tick of a note or rest
//     { cont: true }                                         every further tick of it
// `inst` and `leg` are the instrument / legato events that stand in front of
// that note. Editing a timeline is easy (overwrite cells, insert a cell, remove
// a cell). Packing it back gives a clean event list: adjacent rests are merged.
//
// Instruments: in the grid every note "has" an instrument, the last instrument
// event before it. An edit that changes the instrument in force at some point
// must not silently change the notes after it, so after each edit the first
// note after the edited part gets an instrument event of its own if it used to
// get its instrument from further back (see `repair`). A note entered with the
// instrument that is already in force gets no instrument event. If nothing
// before it in the same pattern sets an instrument, the player's state at that
// point depends on the order list, so the event is written (safe and explicit).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export const MAX_LENGTH = 255;
export const MAX_PATTERNS = 254;
export const MAX_PITCH = 95;

// ---- names and piano keys ----------------------------------------------------

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// "C-4", "F#3": pitch 0 is C-0, 12 pitches per octave.
export function noteLabel(pitch) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12);
}

// Computer keys as a piano: the bottom row is one octave, the row above it the
// next one (the black keys are the number keys). Returns 0..23, or -1.
const LOWER_KEYS = 'zsxdcvgbhnjm';
const UPPER_KEYS = 'q2w3er5t6y7u';
export function pianoSemitone(key) {
  if (typeof key !== 'string' || key.length !== 1) return -1;
  const lower = LOWER_KEYS.indexOf(key);
  if (lower >= 0) return lower;
  const upper = UPPER_KEYS.indexOf(key);
  return upper >= 0 ? 12 + upper : -1;
}

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

// ---- grid rows from events ---------------------------------------------------

// Rows of the grid for an event list. Row kinds:
//   note     first tick of a note: { pitch, inst (number|null), eff (number|null), legato, length }
//   rest     first tick of a rest
//   sustain  later ticks of a note or rest: { of: 'note'|'rest', offset }
//   end      the row after the last tick, always present; it is where you append.
//            Instrument / legato events at the very end of the pattern show here.
// `inst` is the instrument event written in front of this note (null = none: the note
// keeps the instrument of the note before it). `eff` is the instrument in force for the
// note inside this pattern: its own event, else the last event before it, else null
// (then it comes from the pattern before it in the order list, see entryInstruments).
// Every row has `event`, the index of the note/rest event it belongs to (for the
// end row: events.length). `starts[i]` is the row where event i begins; an
// instrument or legato event begins on the row of the note that follows it.
export function buildLayout(events) {
  const rows = [];
  const starts = [];
  let inst = null;
  let eff = null;
  let legato = false;
  events.forEach((ev, i) => {
    starts[i] = rows.length;
    if (ev.type === 'inst') { inst = ev.instrument; eff = ev.instrument; return; }
    if (ev.type === 'legato') { legato = true; return; }
    if (ev.type !== 'note' && ev.type !== 'rest') return;
    const isNote = ev.type === 'note';
    rows.push({ kind: ev.type, event: i, pitch: isNote ? ev.pitch : -1, inst, eff, legato, length: ev.length });
    for (let k = 1; k < ev.length; k++) rows.push({ kind: 'sustain', of: ev.type, event: i, offset: k });
    inst = null;
    legato = false;
  });
  starts[events.length] = rows.length;
  rows.push({ kind: 'end', event: events.length, inst, eff, legato });
  return { rows, starts, total: rows.length - 1 };
}

export function patternTicks(events) {
  let ticks = 0;
  for (const ev of events) if (ev.type === 'note' || ev.type === 'rest') ticks += ev.length;
  return ticks;
}

// The event index the cursor row belongs to (for the end row: events.length).
export function eventIndexAtRow(layout, row) {
  return layout.rows[clamp(row, 0, layout.total)].event;
}

// The row where an event starts (for a stale index: the end row).
export function rowOfEvent(layout, eventIndex) {
  const row = layout.starts[eventIndex];
  return row === undefined ? layout.total : row;
}

// The row a voice is sounding, from the player state. `eventIndex` is the next
// event the player will read (that is what the state block holds) and
// `ticksLeft` the ticks left of the current note or rest, so the current row is
// the start of the next event minus the ticks left.
export function playRow(layout, eventIndex, ticksLeft) {
  if (!Number.isInteger(eventIndex)) return -1;
  return clamp(rowOfEvent(layout, eventIndex) - (ticksLeft || 0), 0, layout.total);
}

// ---- timeline: unpack and pack -----------------------------------------------

const conts = (n) => Array.from({ length: n }, () => ({ cont: true }));
const restHead = () => ({ pitch: -1 });

function toTimeline(events) {
  const cells = [];
  let inst;
  let leg = false;
  for (const ev of events) {
    if (ev.type === 'inst') { inst = ev.instrument; continue; }
    if (ev.type === 'legato') { leg = true; continue; }
    if (ev.type !== 'note' && ev.type !== 'rest') continue;
    const head = { pitch: ev.type === 'note' ? ev.pitch : -1 };
    if (inst !== undefined) head.inst = inst;
    if (leg) head.leg = true;
    inst = undefined;
    leg = false;
    cells.push(head, ...conts(ev.length - 1));
  }
  const trail = {};
  if (inst !== undefined) trail.inst = inst;
  if (leg) trail.leg = true;
  return { cells, trail };
}

function fromTimeline(cells, trail) {
  const events = [];
  const addRest = (length) => {
    while (length > 0) {
      const last = events[events.length - 1];
      if (last && last.type === 'rest' && last.length < MAX_LENGTH) {
        const add = Math.min(length, MAX_LENGTH - last.length);
        last.length += add;
        length -= add;
      } else {
        const add = Math.min(length, MAX_LENGTH);
        events.push({ type: 'rest', length: add });
        length -= add;
      }
    }
  };
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i];
    let j = i + 1;
    while (j < cells.length && cells[j].cont) j++;
    const length = j - i;
    if (cell.inst !== undefined) events.push({ type: 'inst', instrument: cell.inst });
    if (cell.leg) events.push({ type: 'legato' });
    if (cell.pitch >= 0) {
      events.push({ type: 'note', pitch: cell.pitch, length: Math.min(length, MAX_LENGTH) });
      if (length > MAX_LENGTH) addRest(length - MAX_LENGTH);
    } else {
      addRest(length);
    }
    i = j;
  }
  if (trail.inst !== undefined) events.push({ type: 'inst', instrument: trail.inst });
  if (trail.leg) events.push({ type: 'legato' });
  return events;
}

// For every first-tick cell: the instrument in force just before its own
// instrument event (null = nothing set one yet in this pattern).
function instrumentsBefore(cells) {
  const before = new Map();
  let running = null;
  for (const cell of cells) {
    if (cell.cont) continue;
    before.set(cell, running);
    if (cell.inst !== undefined) running = cell.inst;
  }
  return { before, end: running };
}

// Give `head` an instrument event only if `instrument` is not already in force.
function setInstrument(cells, head, instrument) {
  delete head.inst;
  if (instrument === undefined) return;
  if (instrumentsBefore(cells).before.get(head) !== instrument) head.inst = instrument;
}

// Remove instrument events that repeat the instrument already in force (they
// cost two bytes and change nothing). The first event of a pattern stays: nothing
// in this pattern says what is in force there.
function dropRedundant(cells) {
  let running = null;
  for (const cell of cells) {
    if (cell.cont || cell.inst === undefined) continue;
    if (cell.inst === running) delete cell.inst;
    else running = cell.inst;
  }
}

// After an edit: the first NOTE at or after cell `from` that has no instrument
// event of its own may now get a different instrument than before; if so, write
// the old one down. `oldBefore` comes from instrumentsBefore() before the edit.
function repair(cells, oldBefore, from) {
  const now = instrumentsBefore(cells).before;
  for (let i = from; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.cont || cell.pitch < 0 || !oldBefore.has(cell)) continue;
    const wanted = oldBefore.get(cell);
    if (cell.inst === undefined && wanted !== null && now.get(cell) !== wanted) cell.inst = wanted;
    return;
  }
}

// Overwrite `length` ticks from `row` with `head` and its continuation cells.
// A note that started before `row` simply ends there. The rest of a note whose
// first tick was overwritten becomes a rest (it must not extend the new note).
function writeRegion(cells, row, head, length) {
  cells.splice(row, length, head, ...conts(length - 1));
  const next = cells[row + length];
  if (next && next.cont) cells[row + length] = restHead();
}

function runStart(cells, row) {
  while (row > 0 && cells[row].cont) row--;
  return row;
}

function runEnd(cells, start) {
  let end = start + 1;
  while (end < cells.length && cells[end].cont) end++;
  return end;
}

// ---- edits: each returns a new event list, or null for "nothing to do" --------

// A note on `row` lasting `length` ticks, replacing whatever was there.
// Entering at the end row appends. `instrument` is the one to play it with.
export function enterNote(events, row, { pitch, length, instrument }) {
  if (!(pitch >= 0 && pitch <= MAX_PITCH)) return null;
  const { cells, trail } = toTimeline(events);
  const oldBefore = instrumentsBefore(cells);
  row = clamp(row, 0, cells.length);
  length = clamp(length || 1, 1, MAX_LENGTH);
  const head = { pitch };
  if (row === cells.length) {
    // Appending: events that stood at the end of the pattern move in front of it.
    const inForce = trail.inst !== undefined ? trail.inst : oldBefore.end;
    if (trail.leg) head.leg = true;
    if (instrument !== undefined && instrument !== inForce) head.inst = instrument;
    else if (instrument === undefined && trail.inst !== undefined) head.inst = trail.inst;
    cells.push(head, ...conts(length - 1));
    return fromTimeline(cells, {});
  }
  writeRegion(cells, row, head, length);
  setInstrument(cells, head, instrument);
  repair(cells, oldBefore.before, row + length);
  return fromTimeline(cells, trail);
}

// A rest of `length` ticks on `row`, replacing whatever was there.
export function enterRest(events, row, length) {
  const { cells, trail } = toTimeline(events);
  const oldBefore = instrumentsBefore(cells);
  row = clamp(row, 0, cells.length);
  length = clamp(length || 1, 1, MAX_LENGTH);
  writeRegion(cells, row, restHead(), length);
  repair(cells, oldBefore.before, row + length);
  return fromTimeline(cells, trail);
}

// Delete: the note under the cursor (all its ticks) becomes a rest of the same
// length, so the timing of everything after it stays. On the end row it removes
// the instrument / legato events standing there. A rest is left alone.
export function clearAt(events, row) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) {
    if (trail.inst === undefined && !trail.leg) return null;
    return fromTimeline(cells, {});
  }
  const oldBefore = instrumentsBefore(cells).before;
  const start = runStart(cells, row);
  if (cells[start].pitch < 0) return null;
  const end = runEnd(cells, start);
  writeRegion(cells, start, restHead(), end - start);
  repair(cells, oldBefore, end);
  return fromTimeline(cells, trail);
}

// Change the length of the note or rest under the cursor to `newLength` ticks.
//  - note shorter: the freed ticks become rest (later notes keep their place)
//  - note longer: first it eats the rest right after it, if that is not enough
//    the later events move down
//  - rest shorter / longer: ticks are removed / inserted (later events move)
export function setRunLength(events, row, newLength) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  newLength = clamp(newLength, 1, MAX_LENGTH);
  const oldBefore = instrumentsBefore(cells).before;
  const start = runStart(cells, row);
  const end = runEnd(cells, start);
  const length = end - start;
  if (newLength === length) return null;
  const head = cells[start];
  if (head.pitch < 0) {
    if (newLength > length) cells.splice(end, 0, ...conts(newLength - length));
    else cells.splice(start + newLength, length - newLength);
  } else if (newLength < length) {
    cells[start + newLength] = restHead();
  } else {
    // Count the rest ticks right after the note; the note may eat those.
    let freeRest = 0;
    let inRest = false;
    for (let k = end; k < cells.length; k++) {
      if (!cells[k].cont) inRest = cells[k].pitch < 0;
      if (!inRest) break;
      freeRest++;
    }
    const push = Math.max(0, newLength - length - freeRest);
    if (push > 0) cells.splice(end, 0, ...conts(push));
    writeRegion(cells, start, head, newLength);
    repair(cells, oldBefore, start + newLength);
  }
  return fromTimeline(cells, trail);
}

// Insert a row. On the first tick of a note or rest: a rest tick goes in front.
// Inside a note or rest (a later tick): that note or rest gets one tick longer.
export function insertRow(events, row) {
  const { cells, trail } = toTimeline(events);
  row = clamp(row, 0, cells.length);
  if (row < cells.length && cells[row].cont) {
    if (runEnd(cells, runStart(cells, row)) - runStart(cells, row) >= MAX_LENGTH) return null;
    cells.splice(row, 0, { cont: true });
  } else {
    cells.splice(row, 0, restHead());
  }
  return fromTimeline(cells, trail);
}

// Delete a row: that tick disappears and everything after it moves up. If it
// was the first tick of a longer note, the note becomes one tick shorter.
export function deleteRow(events, row) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  const oldBefore = instrumentsBefore(cells).before;
  const cell = cells[row];
  if (!cell.cont && cells[row + 1] && cells[row + 1].cont) {
    cells.splice(row, 2, { ...cell });          // the second tick takes over as first tick
  } else {
    cells.splice(row, 1);
    repair(cells, oldBefore, row);
  }
  return fromTimeline(cells, trail);
}

// Turn the legato marker of the note under the cursor on or off.
export function toggleLegato(events, row) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  const head = cells[runStart(cells, row)];
  if (head.pitch < 0) return null;
  if (head.leg) delete head.leg;
  else head.leg = true;
  return fromTimeline(cells, trail);
}

// Play the note under the cursor with another instrument.
export function setNoteInstrument(events, row, instrument) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  const oldBefore = instrumentsBefore(cells).before;
  const start = runStart(cells, row);
  const head = cells[start];
  if (head.pitch < 0) return null;
  setInstrument(cells, head, instrument);
  repair(cells, oldBefore, runEnd(cells, start));
  dropRedundant(cells);
  return fromTimeline(cells, trail);
}

// The note under the cursor and every note after it in this pattern play with
// `instrument`: their own instrument events are dropped, so one event in front of
// this note does the whole job. (A change written at the very end of the pattern
// is meant for the next pattern and stays.)
export function setInstrumentFrom(events, row, instrument) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  const start = runStart(cells, row);
  if (cells[start].pitch < 0) return null;
  for (let i = start + 1; i < cells.length; i++) if (!cells[i].cont) delete cells[i].inst;
  setInstrument(cells, cells[start], instrument);
  dropRedundant(cells);
  return fromTimeline(cells, trail);
}

// The instrument a pattern leaves in force at its end (its last instrument event),
// or null when it never sets one.
export function lastInstrument(events) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'inst') return events[i].instrument;
  return null;
}

// For every voice and order entry: the instrument in force when that entry starts,
// following the voice from its first entry (the player starts every voice with
// instrument 0 and an instrument stays until an event changes it). A loop is not
// followed, so for the entry a loop jumps to this is the value of the first time round.
export function entryInstruments(song) {
  return song.orders.map((list) => {
    let running = 0;
    return list.map((entry) => {
      const incoming = running;
      if (entryKind(entry) === 'pattern' && song.patterns[entry.pattern]) {
        const last = lastInstrument(song.patterns[entry.pattern].events);
        if (last !== null) running = last;
      }
      return incoming;
    });
  });
}

// Move the pitch of the note under the cursor by `delta` semitones.
export function transposeNote(events, row, delta) {
  const { cells, trail } = toTimeline(events);
  if (row >= cells.length) return null;
  const head = cells[runStart(cells, row)];
  if (head.pitch < 0) return null;
  const pitch = clamp(head.pitch + delta, 0, MAX_PITCH);
  if (pitch === head.pitch) return null;
  head.pitch = pitch;
  return fromTimeline(cells, trail);
}

// ---- order list and pattern list edits (in place on a song) ---------------------

export function entryKind(entry) {
  if (!entry) return 'none';
  if (entry.stop) return 'stop';
  if (entry.loop !== undefined) return 'loop';
  return 'pattern';
}

// Text for an order entry: "03 +00", "STOP", "LOOP 02".
export function entryLabel(entry) {
  const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  switch (entryKind(entry)) {
    case 'stop': return 'STOP';
    case 'loop': return `LOOP ${hex(entry.loop)}`;
    case 'pattern': {
      const t = entry.transpose || 0;
      return `${hex(entry.pattern)} ${t < 0 ? '-' : '+'}${String(Math.abs(t)).padStart(2, '0')}`;
    }
    default: return '';
  }
}

// Who uses pattern n: [{ voice, index }] over all order lists.
export function patternUsers(song, n) {
  const users = [];
  song.orders.forEach((list, voice) => list.forEach((entry, index) => {
    if (entryKind(entry) === 'pattern' && entry.pattern === n) users.push({ voice, index });
  }));
  return users;
}

// Add a pattern at the end; returns its number or -1 when the song is full.
export function addPattern(song, events = [], name = '') {
  if (song.patterns.length >= MAX_PATTERNS) return -1;
  song.patterns.push({ name, events });
  return song.patterns.length - 1;
}

export function duplicatePattern(song, n) {
  const source = song.patterns[n];
  if (!source) return -1;
  return addPattern(song, JSON.parse(JSON.stringify(source.events)), source.name);
}

// Remove pattern n and renumber the later ones. Only call this when
// patternUsers(song, n) is empty.
export function removePattern(song, n) {
  song.patterns.splice(n, 1);
  for (const list of song.orders) {
    for (const entry of list) if (entryKind(entry) === 'pattern' && entry.pattern > n) entry.pattern--;
  }
}

// Insert an entry; loops that pointed at this entry or later ones follow them.
export function insertEntry(song, voice, at, entry) {
  const list = song.orders[voice];
  at = clamp(at, 0, list.length);
  list.splice(at, 0, entry);
  list.forEach((e, i) => { if (i !== at && entryKind(e) === 'loop' && e.loop >= at) e.loop++; });
  return at;
}

// Delete an entry; loops that pointed past it move up (a loop that pointed at
// it now points at the entry that took its place, or the last one).
export function deleteEntry(song, voice, at) {
  const list = song.orders[voice];
  if (at < 0 || at >= list.length) return;
  list.splice(at, 1);
  list.forEach((e) => {
    if (entryKind(e) !== 'loop') return;
    if (e.loop > at) e.loop--;
    e.loop = clamp(e.loop, 0, Math.max(0, list.length - 1));
  });
}

// Point entry `at` of a voice at pattern n. A missing slot, a STOP or a LOOP is
// replaced by a new pattern entry in front of it.
export function assignPattern(song, voice, at, n) {
  const list = song.orders[voice];
  const entry = list[at];
  if (entryKind(entry) === 'pattern') {
    entry.pattern = n;
    return at;
  }
  return insertEntry(song, voice, at, { pattern: n, transpose: 0 });
}

export function setEntryTranspose(song, voice, at, transpose) {
  const entry = song.orders[voice][at];
  if (entryKind(entry) === 'pattern') entry.transpose = clamp(transpose, -96, 96);
}

export function setLoopTarget(song, voice, at, target) {
  const list = song.orders[voice];
  if (entryKind(list[at]) === 'loop') list[at].loop = clamp(target, 0, Math.max(0, list.length - 1));
}

export function setEntryStop(song, voice, at) {
  song.orders[voice][at] = { stop: true };
}

export function setEntryLoop(song, voice, at, target = 0) {
  song.orders[voice][at] = { loop: clamp(target, 0, Math.max(0, song.orders[voice].length - 1)) };
}

// ---- order list: choices, moving, dropping --------------------------------------

export const MAX_ENTRIES = 128;      // per voice, the STOP the serialiser adds when the list does not end in one included

// Can one more entry go into this order list? (The serialiser adds a STOP at the
// end of a list that does not end in STOP or LOOP, and that counts too.)
export function canInsertEntry(list) {
  const last = list[list.length - 1];
  const closed = entryKind(last) === 'stop' || entryKind(last) === 'loop';
  return list.length + 1 + (closed ? 0 : 1) <= MAX_ENTRIES;
}

// What the pattern drop-down of an entry shows and sets: a pattern number, 'stop' or 'loop'.
export function entryChoice(entry) {
  const kind = entryKind(entry);
  return kind === 'pattern' ? entry.pattern : kind;
}

// Set an entry from a drop-down choice. The entry stays where it is (loops that
// point at it keep pointing at it). A pattern keeps its transpose when the entry
// already was a pattern entry; a new loop starts at entry 0.
export function setEntryChoice(song, voice, at, choice) {
  const list = song.orders[voice];
  if (at < 0 || at >= list.length) return;
  if (choice === 'stop') list[at] = { stop: true };
  else if (choice === 'loop') { if (entryKind(list[at]) !== 'loop') list[at] = { loop: 0 }; }
  else if (entryKind(list[at]) === 'pattern') list[at].pattern = choice;
  else list[at] = { pattern: choice, transpose: 0 };
}

// Move entry `from` to position `to` of the same order list (the others shift).
// Loop entries follow what they point at. Returns the new index of the entry.
export function moveEntry(song, voice, from, to) {
  const list = song.orders[voice];
  if (from < 0 || from >= list.length) return from;
  to = clamp(to, 0, list.length - 1);
  if (to === from) return from;
  const order = list.map((_, i) => i);                 // order[newIndex] = oldIndex
  order.splice(to, 0, ...order.splice(from, 1));
  const newIndexOf = [];
  order.forEach((oldIndex, newIndex) => { newIndexOf[oldIndex] = newIndex; });
  const moved = order.map((oldIndex) => list[oldIndex]);
  list.splice(0, list.length, ...moved);
  for (const entry of list) if (entryKind(entry) === 'loop' && newIndexOf[entry.loop] !== undefined) entry.loop = newIndexOf[entry.loop];
  return to;
}

// Put pattern n into an order list the way a drop does. `zone` says where on the
// entry at `index` it landed: 'on' replaces the pattern of that entry (a STOP or LOOP
// gets a new entry in front of it), 'before' / 'after' insert a new entry next to it,
// 'end' appends (in front of a closing STOP or LOOP). A new entry has transpose 0.
// Returns the index of the entry that now holds the pattern, or -1 when the list is full.
export function dropPattern(song, voice, index, zone, n) {
  const list = song.orders[voice];
  if (zone === 'on' && entryKind(list[index]) === 'pattern') {
    list[index].pattern = n;
    return index;
  }
  if (!canInsertEntry(list)) return -1;
  let at = index;
  if (zone === 'after') at = index + 1;
  else if (zone === 'end') {
    const last = list[list.length - 1];
    at = entryKind(last) === 'stop' || entryKind(last) === 'loop' ? list.length - 1 : list.length;
  }
  return insertEntry(song, voice, at, { pattern: n, transpose: 0 });
}

// ---- order list: fields and values --------------------------------------------------

// The fields of an entry that the arrow keys visit, left to right.
export function entryFields(entry) {
  const kind = entryKind(entry);
  if (kind === 'pattern') return ['pattern', 'transpose'];
  if (kind === 'loop') return ['pattern', 'target'];
  return ['pattern'];
}

// A field that exists on this entry: `field` itself, or the closest one that does.
export function validField(entry, field) {
  const fields = entryFields(entry);
  if (fields.includes(field)) return field;
  return field === 'target' || field === 'transpose' ? fields[fields.length - 1] : fields[0];
}

// One step left (-1) or right (+1) from `field`: { field } or { edge: -1 | 1 } when
// there is no field further that way (the caller then goes to the next voice).
export function neighbourField(entry, field, direction) {
  const fields = entryFields(entry);
  const at = fields.indexOf(validField(entry, field)) + direction;
  return at < 0 || at >= fields.length ? { edge: direction } : { field: fields[at] };
}

// Change the value of one field of an entry by `delta` (in place on a song):
//   pattern    previous / next pattern, going round (only on a pattern entry)
//   transpose  semitones, kept within -96..96
//   target     loop target entry
// Returns true when something changed.
export function nudgeEntryField(song, voice, at, field, delta) {
  const list = song.orders[voice];
  const entry = list[at];
  const kind = entryKind(entry);
  if (field === 'pattern' && kind === 'pattern') {
    const count = song.patterns.length;
    if (!count) return false;
    const next = (((entry.pattern + delta) % count) + count) % count;
    if (next === entry.pattern) return false;
    entry.pattern = next;
    return true;
  }
  if (field === 'transpose' && kind === 'pattern') {
    const next = clamp((entry.transpose || 0) + delta, -96, 96);
    if (next === (entry.transpose || 0)) return false;
    entry.transpose = next;
    return true;
  }
  if (field === 'target' && kind === 'loop') {
    const next = clamp(entry.loop + delta, 0, Math.max(0, list.length - 1));
    if (next === entry.loop) return false;
    entry.loop = next;
    return true;
  }
  return false;
}

// Transpose as shown in the control: "+0", "+5", "-12".
export function formatTranspose(transpose) {
  return `${transpose < 0 ? '-' : '+'}${Math.abs(transpose || 0)}`;
}

// What a person may type into the transpose box: "5", "+5", "-12", " - 3 ". Returns
// semitones kept within -96..96, or null when it is not a number.
export function parseTranspose(text) {
  const m = /^\s*([+-]?)\s*(\d{1,3})\s*$/.exec(String(text));
  if (!m) return null;
  const value = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  return clamp(value, -96, 96);
}

// A loop target typed in hex ("0A"), or null.
export function parseHexIndex(text) {
  const m = /^\s*([0-9a-fA-F]{1,2})\s*$/.exec(String(text));
  return m ? parseInt(m[1], 16) : null;
}

// ---- the pattern list --------------------------------------------------------------

// Bytes a pattern takes in the song data: 2 per note, rest and instrument event,
// 1 per legato marker, and the end marker.
export function patternBytes(events) {
  let bytes = 1;
  for (const ev of events) bytes += ev.type === 'legato' ? 1 : 2;
  return bytes;
}

export function noteCount(events) {
  let notes = 0;
  for (const ev of events) if (ev.type === 'note') notes++;
  return notes;
}

// One record per pattern, in pattern-number order:
//   { n, name, ticks, notes, bytes, users: [{ voice, index }], byVoice: [n, n, n], unused }
// A pattern is unused when no order entry of any voice points at it.
export function patternUsage(song) {
  const usage = song.patterns.map((pattern, n) => ({
    n,
    name: pattern.name || '',
    ticks: patternTicks(pattern.events),
    notes: noteCount(pattern.events),
    bytes: patternBytes(pattern.events),
    users: [],
    byVoice: [0, 0, 0],
    unused: true,
  }));
  song.orders.forEach((list, voice) => list.forEach((entry, index) => {
    const record = entryKind(entry) === 'pattern' ? usage[entry.pattern] : null;
    if (!record) return;
    record.users.push({ voice, index });
    record.byVoice[voice]++;
    record.unused = false;
  }));
  return usage;
}

// "V1 x3, V3 x1", or "unused".
export function usageSummary(record) {
  if (record.unused) return 'unused';
  return record.byVoice.map((count, voice) => (count ? `V${voice + 1} x${count}` : '')).filter(Boolean).join(', ');
}

// The reason a pattern cannot be deleted, or '' when it can.
export function deleteRefusal(record) {
  if (!record.unused) return `Pattern ${hex(record.n)} is used by ${usageSummary(record)}. Change those order entries first.`;
  return '';
}

// Remove every pattern that no order entry uses. The later patterns move down and
// the order entries follow them. Returns the numbers (as they were) that went.
export function removeUnusedPatterns(song) {
  const usage = patternUsage(song);
  const removed = usage.filter((record) => record.unused).map((record) => record.n);
  if (!removed.length) return removed;
  const newNumber = new Map();
  const kept = [];
  usage.forEach((record) => {
    if (record.unused) return;
    newNumber.set(record.n, kept.length);
    kept.push(song.patterns[record.n]);
  });
  song.patterns = kept;
  for (const list of song.orders) {
    for (const entry of list) if (entryKind(entry) === 'pattern' && newNumber.has(entry.pattern)) entry.pattern = newNumber.get(entry.pattern);
  }
  return removed;
}

// The entry of `voice` that uses pattern n after entry `afterIndex` (going round to
// the first one), or null. Used to jump from the pattern list to where it plays.
export function nextUse(song, n, voice, afterIndex) {
  const uses = patternUsers(song, n).filter((user) => user.voice === voice);
  if (!uses.length) return null;
  return uses.find((user) => user.index > afterIndex) || uses[0];
}

// "0A tune", "0A" for a pattern without a name.
export function patternTitle(n, name) {
  return name ? `${hex(n)} ${name}` : hex(n);
}

// "01 Lead", "01 (empty)" for a slot without an instrument.
export function instrumentTitle(n, instrument) {
  return `${hex(n)} ${instrument ? instrument.name || '(unnamed)' : '(empty)'}`;
}

function hex(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

// Which pattern number a hex digit typed on a pattern entry gives: the digit
// slides in from the right ("1" then "0" gives 0x10), but only existing
// patterns are accepted; if the two-digit value does not exist the digit alone
// is tried. Returns the new number or -1.
export function typeHexDigit(current, digit, limit) {
  const slid = ((current & 0x0f) << 4) | digit;
  if (slid < limit) return slid;
  return digit < limit ? digit : -1;
}

// ---- key help ---------------------------------------------------------------

// What the keys do, for the help panel: [keys, description].
export function keyHelp() {
  return [
    ['z s x d c v g b h n j m', 'Play and enter a note, lower octave (C to B)'],
    ['q 2 w 3 e r 5 t 6 y 7 u', 'Play and enter a note, one octave higher'],
    ['< and >  (or F1 / F2)', 'Octave down / up'],
    ['1', 'Enter a rest'],
    ['9 / 0', 'Default length of new notes: shorter / longer (ticks)'],
    [";  and  '", 'Step: rows to move down after entering: less / more'],
    ['- / =', 'Make the note or rest under the cursor one tick shorter / longer'],
    ['Delete or .', 'Clear the note under the cursor (it becomes a rest of the same length)'],
    ['Insert / Backspace', 'Insert a row / delete a row (later events move)'],
    ['Shift+Up / Shift+Down', 'Move the note under the cursor a semitone up / down'],
    ['l', 'Legato marker on / off for the note under the cursor'],
    ['[ / ]', 'Previous / next current instrument (the one new notes get)'],
    ['i', 'Type a current instrument number (two hex digits)'],
    ['Enter', 'Give the note under the cursor the current instrument'],
    ['Shift+Enter', 'Give the note under the cursor and all notes after it in the pattern the current instrument'],
    ['Shift+I', 'Open the instrument list for the note under the cursor (the same as clicking its instrument)'],
    ['Up / Down, PageUp / PageDown', 'Move the cursor (1 row, 16 rows)'],
    ['Home / End', 'First row / the end of the pattern'],
    ['Left / Right, Tab / Shift+Tab', 'Switch voice (in the order list Left / Right move between the fields first)'],
    ['Alt+Up / Alt+Down', 'Previous / next entry in the order list of this voice'],
    ['Alt+Shift+Up / Alt+Shift+Down', 'Move the order entry up / down in its list'],
    ['o', 'Switch between the pattern grid and the order list'],
    ['Shift+N', 'New empty pattern, put in this order entry'],
    ['Shift+D', 'Duplicate the pattern of this order entry as a new pattern, put in this entry'],
    ['Shift+X', 'Delete the pattern of this order entry (refused while another entry uses it)'],
    ['Shift+P', 'Go to the Patterns list'],
    ['Order list: Left / Right', 'Move between the fields of the entry: pattern, transpose (or loop target); at the edge go to the next voice'],
    ['Order list: Up / Down', 'Change the field: next / previous pattern, transpose 1 semitone up / down, loop target'],
    ['Order list: Shift+Up / Shift+Down', 'On the transpose field: one octave (12 semitones) up / down'],
    ['Order list: 0-9, a-f', 'Type the pattern number (or the loop target) in hex'],
    ['Order list: PageUp, PageDown, Home, End', 'Previous / next entry, first / last entry'],
    ['Order list: + / -', 'Next / previous pattern number (or loop target), as Up / Down'],
    ['Order list: [ ] and { }', 'Transpose of the entry: 1 semitone / 1 octave down and up (as Shift+Up / Down, kept from earlier versions)'],
    ['Order list: Insert, Backspace', 'Insert an entry after this one / delete this entry'],
    ['Order list: s, l, p', 'Make the entry STOP / LOOP to entry 00 / a pattern again'],
    ['Order list: Enter', 'Go to the pattern grid'],
    ['Patterns list: Up / Down', 'Select the previous / next pattern (Home and End jump)'],
    ['Patterns list: Enter', 'Use the selected pattern in the current order entry'],
    ['Patterns list: Shift+Enter or Insert', 'Insert the selected pattern as a new order entry after the current one'],
    ['Patterns list: F2, Delete, Escape', 'Rename it / delete it (only when unused) / back to the editor'],
    ['Mouse', 'Click a grid row to place the cursor, an instrument chip to change that note\'s instrument; use the controls on every order entry; click a pattern to select it, double-click to use it, drag it onto an order entry or between two entries'],
  ];
}
