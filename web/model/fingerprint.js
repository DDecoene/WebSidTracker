// fingerprint.js - a hash of what defines the player's byte format, so a format change cannot go unnoticed.
//
// It covers the instrument table names and their order, the event codes, the size of the song header,
// the size and layout of the player's state block (offsets relative to its first byte, so it does not
// change when player code before it grows) and the fixed addresses of the instrument tables.
// Bug fixes and sound changes in the player do not change it. A change of meaning that keeps the same
// bytes is not seen (docs/player.md says so).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { createHash } from 'node:crypto';
import { EVENT_CODES, HEADER_SIZE, INSTRUMENT_TABLES } from './serialise.js';

/** @param {Record<string, number>} symbols  the content of web/player/symbols.json
 *  @returns {string} 64 hex characters */
export function formatFingerprint(symbols) {
  const stateNames = Object.keys(symbols).filter((name) => name.startsWith('st_') && name !== 'st_voice_size').sort();
  const base = Math.min(...stateNames.map((name) => symbols[name]));
  const canonical = {
    tables: INSTRUMENT_TABLES,
    eventCodes: EVENT_CODES,
    headerSize: HEADER_SIZE,
    stateVoiceSize: symbols.st_voice_size,
    state: stateNames.map((name) => [name, symbols[name] - base]),
    instruments: Object.keys(symbols).filter((name) => name.startsWith('inst_')).sort().map((name) => [name, symbols[name]]),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
