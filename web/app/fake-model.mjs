// A tiny fake of the model's serialiser, for the tests of live.js and session.js only.
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { TABLE_NAMES } from './live.js';

// Instrument: only `wave` and `ad` are tables. Song bytes: [speed], then for each pattern
// 2 bytes per event (pitch, length) and $FF at the end. Order lists are not in the bytes.

export const symbols = { st_speed: 0x1100, st_transpose: 0x1110, st_instr: 0x1120 };

function fakeSerialiseInstruments(instruments) {
  const tables = {};
  for (const name of TABLE_NAMES) tables[name] = new Uint8Array(256);
  instruments.forEach((inst, i) => {
    if (!inst) return;
    tables.inst_wave[i] = inst.wave;
    tables.inst_ad[i] = inst.ad;
  });
  return tables;
}

export function fakeSerialiseSong(song, base) {
  const bytes = [song.speed];
  const patterns = song.patterns.map((pattern) => {
    const address = base + bytes.length;
    const events = pattern.events.map((event, index) => {
      const offset = base + bytes.length - address;
      if (event.type === 'inst') bytes.push(0x61, event.instrument);
      else bytes.push(event.pitch ?? 0x60, event.length ?? 1);
      return { offset, index, type: event.type };
    });
    const endOffset = base + bytes.length - address;
    bytes.push(0xFF);
    return { address, events, endOffset };
  });
  const orders = song.orders.map((list) => list.map((entry, i) => (
    entry.pattern !== undefined ? { offset: 2 * i, entry: i, pattern: entry.pattern } : { offset: 2 * i, entry: i })));
  return { bytes: Uint8Array.from(bytes), base, size: bytes.length, map: { orders, patterns } };
}

function fakeLocate(map, state, voice) {
  const patternIndex = map.patterns.findIndex((p) => p.address === state.patAddr);
  if (patternIndex < 0) return null;
  const events = map.patterns[patternIndex].events;
  let eventIndex = events.findIndex((e) => e.offset >= state.patPos);
  if (eventIndex < 0) eventIndex = events.length;
  let playingIndex = -1;
  for (let i = eventIndex - 1; i >= 0; i--) if (events[i].type !== 'inst') { playingIndex = i; break; }
  return { entry: state.orderPos >> 1, patternIndex, eventIndex, playingIndex };
}

function fakePlayheadFromLocation(map, loc, voice) {
  const pattern = map.patterns[loc.patternIndex];
  if (!pattern) return null;
  const patPos = loc.eventIndex < pattern.events.length ? pattern.events[loc.eventIndex].offset : pattern.endOffset;
  return { orderPos: loc.entry * 2, patAddr: pattern.address, patPos };
}

export const fakeModel = {
  serialiseInstruments: fakeSerialiseInstruments,
  serialiseSong: fakeSerialiseSong,
  locatePlayhead: fakeLocate,
  playheadFromLocation: fakePlayheadFromLocation,
};


export const note = (pitch, length = 1) => ({ type: 'note', pitch, length });

export function sampleProject() {
  return {
    instruments: [{ wave: 0x40, ad: 0x09 }, { wave: 0x20, ad: 0x5A }],
    song: {
      name: 't', speed: 6,
      patterns: [{ name: '', events: [note(10), note(12), note(14)] }, { name: '', events: [note(1), note(2)] }],
      orders: [[{ pattern: 0, transpose: 0 }, { pattern: 1, transpose: 3 }, { loop: 0 }], [{ pattern: 1, transpose: 0 }], []],
    },
  };
}
