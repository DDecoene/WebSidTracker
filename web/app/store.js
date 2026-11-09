// store.js - the shared state of the tracker: the project, undo/redo, the cursor
// (selection) and the playhead that the engine reports.
//
// No DOM in here, so it runs in Node for the tests. The editor and the instrument
// panel only talk to this object; main.js wires `play`, `stop` and `auditionNote`
// to the audio engine.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

const HISTORY_LIMIT = 200;      // how many undo steps are kept
const MERGE_WINDOW_MS = 1500;   // edits with the same merge key closer than this share one undo step

function defaultSelection() {
  return { voice: 0, orderIndex: 0, eventIndex: 0, instrument: 0, octave: 3, step: 1, defaultLength: 1 };
}

function idlePlayhead() {
  return { running: false, voices: [null, null, null], frameInTick: 0 };
}

/**
 * Make a store around a project.
 * @param {object} project   the project (see the model contract), used as is
 * @param {{now?: () => number, historyLimit?: number}} [options]  `now` can be replaced in tests
 */
export function createStore(project, { now = () => Date.now(), historyLimit = HISTORY_LIMIT } = {}) {
  let current = project;
  let undoStack = [];           // [{ project, label }]: the project as it was BEFORE that step
  let redoStack = [];
  let lastMerge = null;         // { key, time } of the last update() that asked to merge
  const listeners = new Set();

  function notify(change) {
    for (const fn of [...listeners]) {
      try {
        fn(change);
      } catch (error) {
        // One broken listener must not stop the others from hearing about the change.
        console.error('store listener failed', error);
      }
    }
  }

  const store = {
    selection: defaultSelection(),
    playhead: idlePlayhead(),
    engineReady: false,

    // These three are replaced by main.js once the audio engine exists.
    // Until then they do nothing, so the UI can always call them.
    play() {},
    stop() {},
    auditionNote() {},

    get project() {
      return current;
    },

    /**
     * Change the project. `mutator(draft)` edits a deep copy in place; afterwards the
     * copy becomes the project. One call = one undo step.
     * Pass `{ merge: 'key' }` for edits that come in a stream (a slider drag, typing a
     * name): calls with the same key in quick succession share a single undo step.
     * A mutator that changes nothing is ignored. A mutator that throws changes nothing.
     */
    update(label, mutator, { merge = null } = {}) {
      const draft = structuredClone(current);
      mutator(draft);
      if (JSON.stringify(draft) === JSON.stringify(current)) return;

      const time = now();
      const canMerge = merge !== null && lastMerge !== null && lastMerge.key === merge
        && time - lastMerge.time < MERGE_WINDOW_MS && undoStack.length > 0;
      if (!canMerge) {
        undoStack.push({ project: current, label });
        if (undoStack.length > historyLimit) undoStack.shift();
      }
      lastMerge = merge !== null ? { key: merge, time } : null;
      redoStack = [];
      current = draft;
      notify({ kind: 'edit', label });
    },

    /** Replace the whole project (New, Open). The history starts again. */
    load(newProject, label = 'load') {
      current = newProject;
      undoStack = [];
      redoStack = [];
      lastMerge = null;
      store.selection = { ...defaultSelection(), octave: store.selection.octave, step: store.selection.step,
        defaultLength: store.selection.defaultLength };
      notify({ kind: 'load', label });
    },

    undo() {
      const step = undoStack.pop();
      if (!step) return;
      redoStack.push({ project: current, label: step.label });
      current = step.project;
      lastMerge = null;
      notify({ kind: 'undo', label: step.label });
    },

    redo() {
      const step = redoStack.pop();
      if (!step) return;
      undoStack.push({ project: current, label: step.label });
      current = step.project;
      lastMerge = null;
      notify({ kind: 'redo', label: step.label });
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undoLabel: () => (undoStack.length ? undoStack[undoStack.length - 1].label : ''),
    redoLabel: () => (redoStack.length ? redoStack[redoStack.length - 1].label : ''),

    /** Listen to changes. Returns the function that stops listening. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Merge fields into the selection. Tells the listeners only if something changed. */
    select(partial) {
      let changed = false;
      for (const [key, value] of Object.entries(partial)) {
        if (store.selection[key] !== value) {
          store.selection[key] = value;
          changed = true;
        }
      }
      if (changed) notify({ kind: 'select', label: 'select' });
    },

    /** Set by main.js from the engine state; `null` means: nothing playing. */
    setPlayhead(playhead) {
      const next = playhead ?? idlePlayhead();
      if (JSON.stringify(next) === JSON.stringify(store.playhead)) return;
      store.playhead = next;
      notify({ kind: 'playhead', label: 'playhead' });
    },

    /** Used by main.js for changes that are not an edit, e.g. the engine became ready. */
    setEngineReady(ready) {
      if (store.engineReady === ready) return;
      store.engineReady = ready;
      notify({ kind: 'playhead', label: 'engine' });
    },
  };
  return store;
}
