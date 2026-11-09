// editor-logic.js - the pure part of the pattern editor: no DOM, no store.
//
// A pattern is stored as a stream of events (note, rest, instrument, legato),
// see docs/design-player-format-and-timing.md section 4.4. The editor shows it
// as a grid with one row per tick. This file holds
//   1. buildLayout: event list -> grid rows (and back: row -> event index),
//   2. the edits, one function per key. Each takes an event list and a row and
//      returns a NEW event list (or null when nothing would change),
//   3. the order list and pattern list edits (these change a song in place and
//      are meant to run inside store.update).
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
//   note     first tick of a note: { pitch, inst (number|null), legato, length }
//   rest     first tick of a rest
//   sustain  later ticks of a note or rest: { of: 'note'|'rest', offset }
//   end      the row after the last tick, always present; it is where you append.
//            Instrument / legato events at the very end of the pattern show here.
// Every row has `event`, the index of the note/rest event it belongs to (for the
// end row: events.length). `starts[i]` is the row where event i begins; an
// instrument or legato event begins on the row of the note that follows it.
export function buildLayout(events) {
  const rows = [];
  const starts = [];
  let inst = null;
  let legato = false;
  events.forEach((ev, i) => {
    starts[i] = rows.length;
    if (ev.type === 'inst') { inst = ev.instrument; return; }
    if (ev.type === 'legato') { legato = true; return; }
    if (ev.type !== 'note' && ev.type !== 'rest') return;
    const isNote = ev.type === 'note';
    rows.push({ kind: ev.type, event: i, pitch: isNote ? ev.pitch : -1, inst, legato, length: ev.length });
    for (let k = 1; k < ev.length; k++) rows.push({ kind: 'sustain', of: ev.type, event: i, offset: k });
    inst = null;
    legato = false;
  });
  starts[events.length] = rows.length;
  rows.push({ kind: 'end', event: events.length, inst, legato });
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
  return fromTimeline(cells, trail);
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
    ['[ / ]', 'Previous / next instrument'],
    ['i', 'Type an instrument number (two hex digits)'],
    ['Enter', 'Give the note under the cursor the current instrument'],
    ['Up / Down, PageUp / PageDown', 'Move the cursor (1 row, 16 rows)'],
    ['Home / End', 'First row / the end of the pattern'],
    ['Left / Right, Tab / Shift+Tab', 'Switch voice'],
    ['Alt+Up / Alt+Down', 'Previous / next entry in the order list of this voice'],
    ['o', 'Switch between the pattern grid and the order list'],
    ['Shift+N', 'New empty pattern for this order entry'],
    ['Shift+D', 'Duplicate the pattern of this order entry as a new pattern'],
    ['Shift+X', 'Delete the pattern of this order entry (refused while another entry uses it)'],
    ['Order list: + / -', 'Next / previous pattern number (or loop target); hex digits type it'],
    ['Order list: [ ] and { }', 'Transpose of the entry: 1 semitone / 1 octave down and up'],
    ['Order list: Insert, Backspace', 'Insert an entry after this one / delete this entry'],
    ['Order list: s, l, p', 'Make the entry STOP / LOOP to entry 00 / a pattern again'],
    ['Order list: Enter', 'Go to the pattern grid'],
    ['Mouse', 'Click a row or an order entry to place the cursor'],
  ];
}
