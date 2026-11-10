// autosave-lock.js - says when the autosave in this browser must not be overwritten.
//
//   'newer': it was written by a newer release than this one (never touched in this session)
//   'kept':  it is older than this tracker and the person has not decided yet, or chose to leave it
//            alone (until they open, create or load something, or port it)
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export function createAutosaveLock() {
  let reason = null;
  return {
    get reason() { return reason; },
    get blocked() { return reason !== null; },
    set(why) { reason = why; },
    /** Ends a 'kept' lock; a 'newer' lock stays. */
    release() { if (reason === 'kept') reason = null; },
  };
}
