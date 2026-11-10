// handover.js - handing a project file to another release of the tracker through sessionStorage.
//
// The page of the old release is on the same origin, so no address parameter is needed. Every release
// reads this key at start (a released copy can never be changed afterwards, so this is a contract).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { HANDOVER_KEY } from '../version.js';

/** @param storage  anything with setItem (sessionStorage)
 *  @returns {boolean} false when the browser blocks the storage */
export function putHandover(storage, text) {
  try {
    storage.setItem(HANDOVER_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** The handed-over text, or null. The key is removed whatever happens, so a reload never opens it again. */
export function takeHandover(storage) {
  let text = null;
  try {
    text = storage.getItem(HANDOVER_KEY);
  } catch {
    return null;
  }
  try {
    storage.removeItem(HANDOVER_KEY);
  } catch {
    // nothing more to do
  }
  return text;
}
