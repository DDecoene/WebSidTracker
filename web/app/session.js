// session.js - the glue between the store, the model and the audio engine.
//
// Everything that needs the engine lives here, with the engine client, the model and the
// symbols passed in, so tests can use fakes. No DOM. The engine is created lazily on the
// first Play or note (a browser only allows audio after a click or key press).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { createLive, SONG_BASE, AUDITION_BASE, sizeInfo, stateAfterEdit } from './live.js';

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.model      { validate, previewSong, serialiseInstruments, serialiseSong,
 *                                   locatePlayhead, playheadFromLocation }
 * @param {object} deps.symbols    the player's symbols (may be empty: some features then do nothing)
 * @param {() => Promise<object>} deps.createEngineClient
 * @param {() => number} [deps.nowMs]  clock in milliseconds (replaced in tests)
 * @param {object} [deps.on]       callbacks: problems(list), sizes(info), mode('idle'|'song'|'audition'),
 *                                 error(message), notice(message: a short hint, not an error), meter(peak),
 *                                 engine({sampleRate, initMs})
 */
export function createSession({ store, model, symbols, createEngineClient, on = {}, nowMs = () => performance.now() }) {
  const live = createLive({ model, symbols });
  const say = (name, ...args) => { if (on[name]) on[name](...args); };

  let client = null;
  let enginePromise = null;
  let mode = 'idle';              // what the engine is playing: nothing, the song, or an audition
  let lastState = null;           // the latest state message from the engine, brought up to date with the edits sent since
  let editsSent = 0;              // edits sent to the engine; a state that counts fewer predates our last edit
  let token = 0;                  // bumped by every play/stop/audition, so a slow start can notice it lost
  let startedAt = -Infinity;      // nowMs() of the last start
  let problems = [];
  const settings = { chipModel: 0, volume: 0.8, muted: [false, false, false] };

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    say('mode', mode);
  }

  // ---- the project -> bytes ------------------------------------------------

  // Check the project, and if it is fine serialise it. Returns the edit to send, or null.
  function syncProject(kind) {
    problems = model.validate(store.project);
    say('problems', problems);
    if (problems.length > 0) return null;
    try {
      let edit = null;
      if (kind === 'load') live.rebuild(store.project);
      else edit = live.diff(store.project, client && mode === 'song' ? lastState : null);
      say('sizes', sizeInfo(store.project, live.songSize));
      return edit;
    } catch (error) {
      problems = [`The project cannot be turned into song data: ${error.message}`];
      say('problems', problems);
      return null;
    }
  }

  store.subscribe((change) => {
    if (!['edit', 'undo', 'redo', 'load'].includes(change.kind)) return;
    if (change.kind === 'load') stop();
    const edit = syncProject(change.kind);
    if (!client) return;
    if (change.kind === 'load') client.load(live.snapshot());
    else if (edit) sendEdit(edit);
  });

  // States arrive up to ~100 ms after what they describe. Edits sent in the meantime move
  // the song around in memory, so the state we keep is moved with them (the engine does the
  // same to the real voices), and states that were made before the engine applied our latest
  // edit are not used for positions: they speak about the song as it was.
  function sendEdit(edit) {
    client.edit(edit);
    editsSent++;
    lastState = stateAfterEdit(lastState, edit);
  }
  syncProject('load');

  // ---- the engine --------------------------------------------------------

  function handleState(state) {
    say('meter', state.peak ?? 0);
    if (state.edits !== undefined && state.edits < editsSent) return;
    lastState = state;
    if (mode === 'song') store.setPlayhead(live.toStorePlayhead(state, store.project));
  }

  // The engine says the song ended by itself. A message from the song before can still be on
  // its way when a new one has just been started, so a "finished" right after a start is ignored.
  function ended() {
    if (nowMs() - startedAt > 80) finished();
  }

  function finished() {
    setMode('idle');
    store.setPlayhead(null);
  }

  // Create the engine once. Must be called from a click or key handler the first time.
  function ensureEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      try {
        const created = await createEngineClient();
        created.onState = handleState;
        created.onEnded = ended;
        created.onError = (message) => { finished(); say('error', `Audio engine: ${message}`); };
        created.setModel(settings.chipModel);
        created.setVolume(settings.volume);
        settings.muted.forEach((muted, voice) => { if (muted) created.setMuted(voice, true); });
        created.load(live.snapshot());
        client = created;
        store.setEngineReady(true);
        say('engine', { sampleRate: created.sampleRate });
        return created;
      } catch (error) {
        enginePromise = null;
        say('error', `The audio engine could not start: ${error && error.message ? error.message : error}`);
        return null;
      }
    })();
    return enginePromise;
  }

  // ---- transport -----------------------------------------------------------

  async function play({ fromCursor = false } = {}) {
    const mine = ++token;
    const ready = ensureEngine();           // called before any await: still inside the user gesture
    if (problems.length > 0) {
      say('notice', 'Fix the problems listed above before playing.');
      return;
    }
    const engine = await ready;
    if (!engine || mine !== token) return;
    engine.resume?.();                       // a browser may have suspended the audio since the last time
    engine.load(live.snapshot());            // the bytes the mirror holds are the bytes of the project
    engine.start(SONG_BASE);
    startedAt = nowMs();
    if (fromCursor) {
      sendEdit(live.startAt(store.project, store.selection));
    }
    lastState = null;
    setMode('song');
  }

  function stop() {
    token++;
    if (client) client.stop();
    if (mode !== 'idle') finished();
  }

  // There is one player. An audition would take it away from the song, which then would not come
  // back, so while the song plays, notes are not auditioned: the editor puts the note in the
  // pattern and the song plays it when it gets there.
  async function audition(instrument, pitch) {
    if (mode === 'song') return;
    const mine = ++token;
    const ready = ensureEngine();
    const engine = await ready;
    if (!engine || mine !== token || problems.length > 0) return;
    engine.resume?.();
    try {
      const preview = model.previewSong(instrument, pitch);
      const song = preview.song || preview;
      const bytes = model.serialiseSong(song, AUDITION_BASE).bytes;
      engine.load([{ address: AUDITION_BASE, bytes }]);
      engine.start(AUDITION_BASE);
      startedAt = nowMs();
      lastState = null;
      store.setPlayhead(null);
      setMode('audition');
    } catch (error) {
      say('error', `Cannot play that note: ${error.message}`);
    }
  }

  store.play = (options) => { play(options); };
  store.stop = stop;
  store.auditionNote = (instrument, pitch) => { audition(instrument, pitch); };

  return {
    get mode() { return mode; },
    get problems() { return problems; },
    get engine() { return client; },
    ensureEngine,
    play,
    stop,
    audition,
    setChipModel(value) {
      settings.chipModel = value;
      if (client) client.setModel(value);
    },
    setVolume(value) {
      settings.volume = value;
      if (client) client.setVolume(value);
    },
    setMuted(voice, muted) {
      settings.muted[voice] = muted;
      if (client) client.setMuted(voice, muted);
    },
  };
}
