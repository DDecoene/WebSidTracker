// serialise.js - turns the song model into the exact bytes of the player format
// (docs/design-player-format-and-timing.md, sections 4 and 5), and back.
//
// Layout of a serialised song, in this order:
//   header (9 bytes) | pattern table | order list voice 1, 2, 3 | patterns 0, 1, 2 ...
// Every address in the output is absolute (it depends on the `base` you pass).
//
// An order list must end in a stop or loop entry, otherwise the player would
// run off the end of it. If the model's list does not end that way (or is
// empty) the serialiser adds a stop entry ($FE, 0) at the end. That extra
// entry is not part of the model, so it does not appear in the map.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export const HEADER_SIZE = 9;

// Limits of the player (docs/player.md, section 7): the pattern position and the order position
// are one byte each in the player's state block.
export const MAX_PATTERN_BYTES = 255;   // a pattern, its $FF end marker included
export const MAX_ORDER_ENTRIES = 128;   // one order list, an added STOP entry included (offset 2*i must fit a byte)

// Names of the 15 instrument tables, in the order of the memory map (table k lives at $2000 + k*$100).
export const INSTRUMENT_TABLES = [
  'inst_wave', 'inst_ad', 'inst_sr', 'inst_pw_lo', 'inst_pw_hi', 'inst_pw_step', 'inst_pw_min',
  'inst_pw_max', 'inst_vib_delay', 'inst_vib_depth', 'inst_vib_speed', 'inst_arp',
  'inst_drum_noise', 'inst_drum_fall', 'inst_release',
];

const EV_REST = 0x60;
const EV_INST = 0x61;
const EV_LEGATO = 0x62;
const EV_END = 0xFF;
const ORD_STOP = 0xFE;
const ORD_LOOP = 0xFF;

// The byte values that mark events and order entries; part of the format (see web/model/fingerprint.js).
export const EVENT_CODES = {
  rest: EV_REST, inst: EV_INST, legato: EV_LEGATO, end: EV_END, orderStop: ORD_STOP, orderLoop: ORD_LOOP,
};

function checkInt(value, lo, hi, what) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new RangeError(`${what} must be a whole number from ${lo} to ${hi}, got ${value}`);
  }
  return value;
}

// ---------------------------------------------------------------- instruments

// One entry per table field: [table, model field, min, max, how to turn the value into a byte].
export function serialiseInstruments(instruments) {
  if (instruments.length > 256) throw new RangeError('at most 256 instruments');
  const tables = {};
  for (const name of INSTRUMENT_TABLES) tables[name] = new Uint8Array(256);
  instruments.forEach((inst, n) => {
    if (!inst) return;
    const at = (field, lo, hi) => checkInt(inst[field], lo, hi, `instrument ${n} ${field}`);
    tables.inst_wave[n] = at('wave', 0, 255);
    tables.inst_ad[n] = at('ad', 0, 255);
    // The byte is written as it is. The player only uses the sustain nibble (high); its release nibble is
    // ignored, and lint() warns when it is not 0. We do not change the user's data here.
    tables.inst_sr[n] = at('sr', 0, 255);
    const pw = at('pw', 0, 4095);
    tables.inst_pw_lo[n] = pw & 0xFF;
    tables.inst_pw_hi[n] = pw >> 8;
    tables.inst_pw_step[n] = at('pwStep', -128, 127) & 0xFF;
    tables.inst_pw_min[n] = at('pwMin', 0, 255);
    tables.inst_pw_max[n] = at('pwMax', 0, 255);
    tables.inst_vib_delay[n] = at('vibDelay', 0, 255);
    tables.inst_vib_depth[n] = at('vibDepth', 0, 255);
    tables.inst_vib_speed[n] = at('vibSpeed', 0, 255);
    tables.inst_arp[n] = at('arp', -128, 127) & 0xFF;
    tables.inst_drum_noise[n] = at('drumNoise', 0, 255);
    tables.inst_drum_fall[n] = at('drumFall', 0, 255);
    tables.inst_release[n] = at('release', 0, 255);
  });
  return tables;
}

// ---------------------------------------------------------------- song

function eventSize(ev) {
  switch (ev.type) {
    case 'note': case 'rest': case 'inst': return 2;
    case 'legato': return 1;
    default: throw new RangeError(`unknown event type "${ev.type}"`);
  }
}

// Bytes of one pattern, the $FF end marker included.
export function patternBytes(pattern) {
  return pattern.events.reduce((sum, ev) => sum + (ev && ev.type === 'legato' ? 1 : 2), 1);
}

// Entries of an order list as the player sees it: the serialiser adds a STOP when the list does not end in one.
export function orderListLength(entries) {
  return entries.length + (entryNeedsTerminator(entries) ? 1 : 0);
}

export function entryNeedsTerminator(entries) {
  const last = entries[entries.length - 1];
  return !last || !(last.stop || last.loop !== undefined);
}

// Sizes and relative offsets of every part of a song, without producing bytes.
export function measureSong(song) {
  const patterns = song.patterns.length;
  let pos = HEADER_SIZE;
  const tableOffset = pos;
  pos += 2 * patterns;
  const orderOffsets = [];
  for (let v = 0; v < 3; v++) {
    orderOffsets.push(pos);
    const entries = song.orders[v];
    pos += 2 * (entries.length + (entryNeedsTerminator(entries) ? 1 : 0));
  }
  const patternOffsets = [];
  for (const pattern of song.patterns) {
    patternOffsets.push(pos);
    for (const ev of pattern.events) pos += eventSize(ev);
    pos += 1; // the $FF end marker
  }
  return { size: pos, tableOffset, orderOffsets, patternOffsets, patterns };
}

export function serialiseSong(song, base = 0x3000) {
  const layout = measureSong(song);
  if (layout.patterns > 254) throw new RangeError('at most 254 patterns (numbers 0 to 253)');
  if (base + layout.size > 0x10000) throw new RangeError('song does not fit in 64 KB at this address');
  checkInt(song.speed, 1, 255, 'speed');
  song.patterns.forEach((pattern, n) => {
    const size = patternBytes(pattern);
    if (size > MAX_PATTERN_BYTES) throw new RangeError(`pattern ${n} is ${size} bytes, the player allows ${MAX_PATTERN_BYTES} (its end marker included)`);
  });
  song.orders.forEach((entries, v) => {
    if (orderListLength(entries) > MAX_ORDER_ENTRIES) throw new RangeError(`voice ${v + 1} has ${orderListLength(entries)} order entries (a STOP is added when the list does not end in one), the player allows ${MAX_ORDER_ENTRIES}`);
  });

  const bytes = new Uint8Array(layout.size);
  const word = (offset, address) => { bytes[offset] = address & 0xFF; bytes[offset + 1] = address >> 8; };

  bytes[0] = song.speed;
  for (let v = 0; v < 3; v++) word(1 + 2 * v, base + layout.orderOffsets[v]);
  word(7, base + layout.tableOffset);
  layout.patternOffsets.forEach((off, n) => word(layout.tableOffset + 2 * n, base + off));

  const map = { tableAddress: base + layout.tableOffset, orderAddresses: [], orders: [[], [], []], patterns: [] };

  for (let v = 0; v < 3; v++) {
    const entries = song.orders[v];
    const start = layout.orderOffsets[v];
    map.orderAddresses.push(base + start);
    entries.forEach((entry, i) => {
      const at = start + 2 * i;
      if (entry.stop) {
        bytes[at] = ORD_STOP;
      } else if (entry.loop !== undefined) {
        bytes[at] = ORD_LOOP;
        bytes[at + 1] = checkInt(entry.loop, 0, MAX_ORDER_ENTRIES - 1, 'loop target');
      } else {
        bytes[at] = checkInt(entry.pattern, 0, 253, 'order entry pattern');
        if (entry.pattern >= layout.patterns) throw new RangeError(`order entry uses missing pattern ${entry.pattern}`);
        bytes[at + 1] = checkInt(entry.transpose, -128, 127, 'transpose') & 0xFF;
      }
      // `pattern` is only present on pattern entries (extra field for the playhead functions)
      map.orders[v].push(entry.pattern !== undefined && !entry.stop && entry.loop === undefined
        ? { offset: 2 * i, entry: i, pattern: entry.pattern }
        : { offset: 2 * i, entry: i });
    });
    if (entryNeedsTerminator(entries)) bytes[start + 2 * entries.length] = ORD_STOP;
  }

  song.patterns.forEach((pattern, n) => {
    let at = layout.patternOffsets[n];
    const events = [];
    pattern.events.forEach((ev, index) => {
      events.push({ offset: at - layout.patternOffsets[n], index, type: ev.type });
      switch (ev.type) {
        case 'note':
          bytes[at] = checkInt(ev.pitch, 0, 95, 'note pitch');
          bytes[at + 1] = checkInt(ev.length, 1, 255, 'note length');
          break;
        case 'rest':
          bytes[at] = EV_REST;
          bytes[at + 1] = checkInt(ev.length, 1, 255, 'rest length');
          break;
        case 'inst':
          bytes[at] = EV_INST;
          bytes[at + 1] = checkInt(ev.instrument, 0, 255, 'instrument number');
          break;
        case 'legato':
          bytes[at] = EV_LEGATO;
          break;
      }
      at += eventSize(ev);
    });
    bytes[at] = EV_END;
    map.patterns.push({
      address: base + layout.patternOffsets[n],
      events,
      endOffset: at - layout.patternOffsets[n], // offset of the $FF marker
    });
  });

  return { bytes, base, headerAddress: base, size: layout.size, map };
}

// Inverse of serialiseSong, for tests and import. Names are not stored in the bytes,
// so they come back empty. The pattern count is derived from the layout above:
// the pattern table runs up to the first order list that follows it.
export function parseSong(bytes, base = 0x3000) {
  const at = (address) => {
    const i = address - base;
    if (i < 0 || i >= bytes.length) throw new RangeError(`address $${address.toString(16)} is outside the song data`);
    return bytes[i];
  };
  const wordAt = (address) => at(address) | (at(address + 1) << 8);

  const speed = at(base);
  const orderAddresses = [wordAt(base + 1), wordAt(base + 3), wordAt(base + 5)];
  const table = wordAt(base + 7);
  const after = orderAddresses.filter((a) => a > table);
  const tableEnd = after.length ? Math.min(...after) : base + bytes.length;

  const patterns = [];
  for (let a = table; a < tableEnd; a += 2) {
    let p = wordAt(a);
    const events = [];
    for (;;) {
      const b = at(p);
      if (b === EV_END) break;
      if (b <= 0x5F) { events.push({ type: 'note', pitch: b, length: at(p + 1) }); p += 2; }
      else if (b === EV_REST) { events.push({ type: 'rest', length: at(p + 1) }); p += 2; }
      else if (b === EV_INST) { events.push({ type: 'inst', instrument: at(p + 1) }); p += 2; }
      else if (b === EV_LEGATO) { events.push({ type: 'legato' }); p += 1; }
      else throw new Error(`invalid pattern byte $${b.toString(16)} at $${p.toString(16)}`);
    }
    patterns.push({ name: '', events });
  }

  const orders = orderAddresses.map((start) => {
    const entries = [];
    for (let p = start; ; p += 2) {
      const b = at(p);
      const arg = at(p + 1);
      if (b === ORD_STOP) { entries.push({ stop: true }); break; }
      if (b === ORD_LOOP) { entries.push({ loop: arg }); break; }
      entries.push({ pattern: b, transpose: arg > 127 ? arg - 256 : arg });
    }
    return entries;
  });

  return { name: '', speed, patterns, orders };
}

// ---------------------------------------------------------------- playhead

// Turns the player's position for one voice into model terms.
//   state = { orderPos, patAddr, patPos } as in the player's state block:
//   orderPos = byte offset into the order list, patAddr = address of the current pattern,
//   patPos = byte offset (inside that pattern) of the NEXT event to read.
// Returns { entry, patternIndex, eventIndex, playingIndex } or null.
//   eventIndex   = the event the player will read next (events.length = the end marker)
//   playingIndex = the last note or rest before it, i.e. the one that is sounding (-1 = none yet)
// The entry is normally orderPos/2. If that entry does not use the pattern at patAddr
// (a player that already moved on to the next entry), the entry just before it is tried.
export function locatePlayhead(map, state, voice) {
  const patternIndex = map.patterns.findIndex((p) => p.address === state.patAddr);
  if (patternIndex < 0) return null;
  const pattern = map.patterns[patternIndex];

  let eventIndex = pattern.events.findIndex((e) => e.offset >= state.patPos);
  if (eventIndex < 0) eventIndex = pattern.events.length;

  const guess = state.orderPos >> 1;
  let entry = guess;
  const list = map.orders[voice] || [];
  const usesPattern = (i) => list[i] && list[i].pattern === patternIndex;
  if (!usesPattern(guess) && usesPattern(guess - 1)) entry = guess - 1;

  return { entry, patternIndex, eventIndex, playingIndex: playingEvent(map, patternIndex, eventIndex) };
}

function playingEvent(map, patternIndex, eventIndex) {
  const events = map.patterns[patternIndex].events;
  for (let i = Math.min(eventIndex, events.length) - 1; i >= 0; i--) {
    if (events[i].type === 'note' || events[i].type === 'rest') return i;
  }
  return -1;
}

// The opposite direction: where should the player be, in the NEW song, so that it
// keeps sounding "the same place" after an edit? loc is the result of locatePlayhead
// on the OLD map. Never throws. Rules:
//  - the entry is clamped into the new order list;
//  - an entry that is no longer a pattern entry (it became STOP or LOOP) is replaced by the
//    end of the nearest earlier pattern entry, so the voice finishes it and then follows the STOP/LOOP;
//  - an event index past the end of the pattern points at the end marker (the player then
//    moves on to the next entry by itself);
//  - returns null when the voice has no pattern entry at all.
// orderPos is the offset of the entry whose pattern is playing.
export function playheadFromLocation(newMap, loc, voice) {
  const list = newMap.orders[voice] || [];
  if (!loc || !list.length) return null;
  const isPatternEntry = (i) => entryPattern(newMap, voice, i) !== null;

  let entry = Math.min(Math.max(loc.entry, 0), list.length - 1);
  let atEnd = false;
  if (!isPatternEntry(entry)) {
    let i = entry - 1;
    while (i >= 0 && !isPatternEntry(i)) i--;
    if (i >= 0) { entry = i; atEnd = true; }
    else {
      i = entry + 1;
      while (i < list.length && !isPatternEntry(i)) i++;
      if (i >= list.length) return null;
      entry = i;
    }
  }
  const pattern = newMap.patterns[entryPattern(newMap, voice, entry)];
  const eventIndex = atEnd ? pattern.events.length : loc.eventIndex;
  const patPos = eventIndex < pattern.events.length ? pattern.events[eventIndex].offset : pattern.endOffset;
  return { orderPos: list[entry].offset, patAddr: pattern.address, patPos };
}

function entryPattern(map, voice, entry) {
  const p = map.orders[voice][entry] && map.orders[voice][entry].pattern;
  return p !== undefined && map.patterns[p] ? p : null;
}
