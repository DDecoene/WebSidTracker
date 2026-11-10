// autosave-lock.js - says when the autosave in this browser must not be overwritten.
//
// It is held while an older autosave waits for the person's decision (port it, open it in the old tracker,
// or leave it), and stays held when they leave it, until they open, create or load something themselves.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export function createAutosaveLock() {
  let held = false;
  return {
    get blocked() { return held; },
    hold() { held = true; },
    release() { held = false; },
  };
}
