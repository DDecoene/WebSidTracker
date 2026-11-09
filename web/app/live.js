// live.js - the pure part of live editing. No DOM, no audio, no timers.
//
// The song model is the truth. The engine holds bytes in emulated RAM. This module
// remembers which bytes the engine has (the "mirror") and, when the project changes,
// works out the smallest set of RAM writes plus the playhead fix-up that turns the
// engine's RAM into the new project, as one `edit` message.
//
// The serialiser functions are passed in (`model`), so the tests can use small fakes:
//   model.serialiseInstruments(instruments) -> { inst_wave: Uint8Array(256), ... }
//   model.serialiseSong(song, base)         -> { bytes, size, map, ... }
//   model.locatePlayhead(map, state, voice) -> { entry, patternIndex, eventIndex, playingIndex } | null
//   model.playheadFromLocation(map, loc, voice) -> { orderPos, patAddr, patPos } | null
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export const SONG_BASE = 0x3000;        // where the tracker keeps the song in the emulated RAM
export const AUDITION_BASE = 0xC000;    // scratch song for note auditions
export const SONG_LIMIT = 0xC000;       // the song must end below this address
export const FIRST_TABLE = 0x2000;      // the 15 instrument tables follow each other, 256 bytes each

export const TABLE_NAMES = [
  'inst_wave', 'inst_ad', 'inst_sr', 'inst_pw_lo', 'inst_pw_hi', 'inst_pw_step', 'inst_pw_min',
  'inst_pw_max', 'inst_vib_delay', 'inst_vib_depth', 'inst_vib_speed', 'inst_arp',
  'inst_drum_noise', 'inst_drum_fall', 'inst_release',
];

/** Address of an instrument table: from the player's symbols, else the fixed layout. */
export function tableAddress(name, symbols) {
  const fromSymbols = symbols && symbols[name];
  return fromSymbols !== undefined ? fromSymbols : FIRST_TABLE + TABLE_NAMES.indexOf(name) * 0x100;
}

/**
 * The places where `next` differs from `previous`, as write blocks.
 * Two changes closer together than `maxGap` unchanged bytes become one block (fewer, larger
 * writes; the bytes in between are rewritten with the value they already have).
 * Bytes past the end of `previous` count as changed.
 * @returns {{address: number, bytes: Uint8Array}[]}
 */
export function diffBytes(previous, next, address, maxGap = 8) {
  const runs = [];
  const had = previous ? previous.length : 0;
  const differs = (i) => i >= had || previous[i] !== next[i];
  let i = 0;
  while (i < next.length) {
    if (!differs(i)) { i++; continue; }
    let end = i + 1;                       // one past the last differing byte of this block
    for (let j = i + 1; j < next.length && j - end <= maxGap; j++) {
      if (differs(j)) end = j + 1;
    }
    runs.push({ address: address + i, bytes: next.slice(i, end) });
    i = end;
  }
  return runs;
}

/** Bytes the instrument tables take in an export: 15 tables, trimmed to the highest used slot. */
export function instrumentBytes(instruments) {
  let used = 0;
  instruments.forEach((instrument, index) => { if (instrument) used = index + 1; });
  return used * TABLE_NAMES.length;
}

/** Size figures for the status readout. */
export function sizeInfo(project, songSize, songBase = SONG_BASE) {
  return {
    song: songSize,
    instruments: instrumentBytes(project.instruments),
    free: Math.max(0, SONG_LIMIT - songBase - songSize),
  };
}

/**
 * Where did old element `index` of `before` go in `after`? Edits are mostly one insert,
 * delete or change, so: the unchanged start and the unchanged end are matched up, and an
 * index inside the changed middle keeps its distance from the start (clamped to the middle).
 */
export function mapIndex(before, after, index) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let head = 0;
  while (head < before.length && head < after.length && same(before[head], after[head])) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head
    && same(before[before.length - 1 - tail], after[after.length - 1 - tail])) tail++;
  if (index < head) return index;
  if (index >= before.length - tail) return index + after.length - before.length;
  return head + Math.min(index - head, after.length - tail - head);
}

// The playhead location `loc` was found in the old project. Give the location of the same
// order entry and event in the new project.
function followEdit(oldProject, newProject, loc, voice) {
  const entry = mapIndex(oldProject.song.orders[voice], newProject.song.orders[voice], loc.entry);
  const target = newProject.song.orders[voice][entry];
  const patternIndex = target && target.pattern !== undefined ? target.pattern : loc.patternIndex;
  const oldEvents = oldProject.song.patterns[loc.patternIndex]?.events ?? [];
  const newEvents = newProject.song.patterns[patternIndex]?.events ?? [];
  return { ...loc, entry, patternIndex, eventIndex: mapIndex(oldEvents, newEvents, loc.eventIndex) };
}

const samePlace = (a, b) => a.orderPos === b.orderPos && a.patAddr === b.patAddr && a.patPos === b.patPos;

/**
 * @param {{model: object, symbols?: object, songBase?: number}} options
 */
export function createLive({ model, symbols = {}, songBase = SONG_BASE }) {
  let mirror = null;      // { tables, song, speed } as the engine has it

  function serialiseAll(project) {
    return {
      tables: model.serialiseInstruments(project.instruments),
      song: model.serialiseSong(project.song, songBase),
      speed: project.song.speed,
      project,
    };
  }

  return {
    /** Serialise the project and remember it as "what the engine has". May throw. */
    rebuild(project) {
      mirror = serialiseAll(project);
      return mirror;
    },

    /** Everything the mirror holds, as writes: for loading a fresh engine. */
    snapshot() {
      if (!mirror) return [];
      const writes = TABLE_NAMES.filter((name) => mirror.tables[name])
        .map((name) => ({ address: tableAddress(name, symbols), bytes: mirror.tables[name] }));
      writes.push({ address: songBase, bytes: mirror.song.bytes });
      return writes;
    },

    get map() { return mirror ? mirror.song.map : null; },
    get songSize() { return mirror ? mirror.song.size : 0; },

    /**
     * The project changed. Compute the edit that updates the engine, and remember the new
     * bytes. `state` is the last engine state if a song is playing (so playheads need a
     * fix-up), else null. Returns null when the engine already has these bytes.
     * May throw if the project cannot be serialised; the mirror is then left alone.
     */
    diff(project, state = null) {
      const previous = mirror;
      const next = serialiseAll(project);
      mirror = next;
      if (!previous) return { writes: this.snapshot(), playhead: [null, null, null] };

      const writes = [];
      for (const name of TABLE_NAMES) {
        if (!next.tables[name]) continue;
        writes.push(...diffBytes(previous.tables[name], next.tables[name], tableAddress(name, symbols)));
      }
      const songWrites = diffBytes(previous.song.bytes, next.song.bytes, songBase);
      writes.push(...songWrites);

      // The speed also lives in the player's state, copied from the header when the song
      // starts. Changing the header alone would only be heard after a restart.
      if (previous.speed !== next.speed && symbols.st_speed !== undefined) {
        writes.push({ address: symbols.st_speed, bytes: Uint8Array.of(next.speed) });
      }

      const playhead = [null, null, null];
      if (state && state.running && songWrites.length > 0) {
        for (let voice = 0; voice < 3; voice++) {
          const now = state.voices[voice];
          const loc = now && model.locatePlayhead(previous.song.map, now, voice);
          if (!loc) continue;
          const moved = model.playheadFromLocation(next.song.map, followEdit(previous.project, project, loc, voice), voice);
          // Only move a voice that really changed place. The state we hold is up to 50 ms
          // old, so leaving unaffected voices alone avoids pulling them back.
          if (moved && !samePlace(moved, now)) playhead[voice] = moved;
        }
      }
      if (writes.length === 0 && playhead.every((p) => p === null)) return null;
      return { writes, playhead };
    },

    /**
     * Edit that makes a freshly started song begin at the cursor: every voice at the
     * selected order entry, the selected voice also at the selected event. Also writes
     * the transpose and instrument the voice would have at that point.
     * Needs the mirror to be in sync with `project` (call rebuild first).
     */
    startAt(project, selection) {
      const map = mirror && mirror.song.map;
      const playhead = [null, null, null];
      const writes = [];
      if (!map) return { writes, playhead };

      for (let voice = 0; voice < 3; voice++) {
        const entries = project.song.orders[voice];
        const entry = entries[selection.orderIndex];
        const mapEntry = map.orders[voice][selection.orderIndex];
        const pattern = entry && entry.pattern !== undefined && mapEntry && map.patterns[entry.pattern];
        if (!pattern) continue;

        const eventIndex = voice === selection.voice
          ? Math.min(Math.max(selection.eventIndex, 0), pattern.events.length) : 0;
        const patPos = eventIndex < pattern.events.length ? pattern.events[eventIndex].offset : pattern.endOffset;
        playhead[voice] = { orderPos: mapEntry.offset, patAddr: pattern.address, patPos, ticksLeft: 0 };

        if (symbols.st_transpose !== undefined) {
          writes.push({ address: symbols.st_transpose + voice, bytes: Uint8Array.of(entry.transpose & 0xFF) });
        }
        if (symbols.st_instr !== undefined) {
          const instrument = instrumentBefore(project.song, entries, selection.orderIndex, eventIndex);
          writes.push({ address: symbols.st_instr + voice, bytes: Uint8Array.of(instrument) });
        }
      }
      return { writes, playhead };
    },

    /**
     * Engine state -> `store.playhead`. A voice that is not inside a pattern (it stopped, or
     * the engine plays something else) becomes null.
     */
    toStorePlayhead(state, project = null) {
      const map = mirror && mirror.song.map;
      const none = { running: false, voices: [null, null, null], frameInTick: 0 };
      if (!state || !state.running || !map) return none;
      const voices = state.voices.map((now, voice) => {
        const loc = now && model.locatePlayhead(map, now, voice);
        if (!loc) return null;
        const events = project && project.song.patterns[loc.patternIndex]
          ? project.song.patterns[loc.patternIndex].events.length : Infinity;
        const sounding = loc.playingIndex >= 0 ? loc.playingIndex : loc.eventIndex;
        return {
          orderIndex: loc.entry,
          eventIndex: Math.min(sounding, Math.max(events - 1, 0)),
          patternIndex: loc.patternIndex,
          ticksLeft: now.ticksLeft,
        };
      });
      return { running: true, voices, frameInTick: state.frameInTick };
    },
  };
}

// The instrument a voice has when it reaches (orderIndex, eventIndex): the last instrument
// event before that point, counting back through the earlier order entries. Default 0.
function instrumentBefore(song, entries, orderIndex, eventIndex) {
  const lastIn = (events) => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'inst') return events[i].instrument;
    }
    return null;
  };
  const here = entries[orderIndex];
  const hereEvents = here && here.pattern !== undefined && song.patterns[here.pattern]
    ? song.patterns[here.pattern].events.slice(0, eventIndex) : [];
  let found = lastIn(hereEvents);
  for (let i = orderIndex - 1; found === null && i >= 0; i--) {
    const entry = entries[i];
    if (entry.pattern !== undefined && song.patterns[entry.pattern]) found = lastIn(song.patterns[entry.pattern].events);
  }
  return found === null ? 0 : found;
}
