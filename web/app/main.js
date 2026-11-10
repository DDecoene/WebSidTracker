// main.js - starts the tracker: loads the project, creates the store and the audio session,
// mounts the pattern editor and the instrument panel, and wires the header, the dialogs and
// the keyboard shortcuts.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { createStore } from './store.js';
import { createSession } from './session.js';
import { createMessages, createManualDialog, renderExport } from './panels.js';
import { SECTIONS, loadKeySources } from './manual.js';
import { parseDeepLink } from './deeplink.js';
import { slug, readText, download } from './files.js';
import * as projectModel from '../model/project.js';
import * as serialiser from '../model/serialise.js';
import * as exporter from '../model/export.js';
import { DEMOS, findDemo, demoLabel } from '../model/demos/index.js';
import { createEngineClient } from '../engine/client.js';
import { FORMAT, RELEASE, autosaveKeyFor, isDevChannel, pickRelease, siteRoot } from '../version.js';
import { inspectProject } from '../model/migrate.js';
import { NewerFormatError, OlderFormatError } from '../model/format.js';
import { readAutosave } from './autosave.js';
import { putHandover, takeHandover } from './handover.js';
import { frozenUrl, loadReleases } from './releases.js';
import { describeUpgrade } from './upgrade.js';
import { askUpgrade } from './upgrade-dialog.js';
import { createAutosaveLock } from './autosave-lock.js';

const AUTOSAVE_STORAGE_KEY = autosaveKeyFor(location.pathname);   // one key per format; the development copy has its own
const WELCOME_KEY = 'websidtracker.welcome.dismissed';
const FIRST_START_DEMO = 'ode-to-joy';   // what a new visitor hears when they press Play
const PAL_FRAMES_PER_SECOND = 985248 / 19656;

const $ = (id) => document.getElementById(id);

// ---- storage that may be blocked -------------------------------------------

// While the autosave in this browser must not be overwritten, saveAutosave does nothing (see autosave-lock.js).
const autosaveLock = createAutosaveLock();

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function saveAutosave(project) {
  if (autosaveLock.blocked) return;
  try {
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, exporter.projectToJson(project));
  } catch {
    // blocked or full: the user can still use Save
  }
}

function welcomeDismissed() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberWelcomeDismissed() {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // blocked storage: the notice comes back next time, which is harmless
  }
}

async function fetchJson(relativeUrl) {
  const response = await fetch(new URL(relativeUrl, import.meta.url));
  if (!response.ok) throw new Error(`${relativeUrl}: HTTP ${response.status}`);
  return response.json();
}

// ---- the page -----------------------------------------------------------------

async function main() {
  const messages = createMessages($('messages'));
  // Start: a demo asked for in the address (?demo=id), else the autosave, else the first-start demo.
  const link = parseDeepLink(location.search);
  const autosave = readAutosave(localStore() ?? { getItem: () => { throw new Error('blocked'); } }, location.pathname);
  const saved = autosave.kind === 'project' ? autosave.project : null;
  // A file handed over by another release of the tracker (see handover.js) comes first.
  let handoverProject = null;
  let handoverError = null;
  const handoverText = takeHandover(sessionStore());
  if (handoverText !== null) {
    try {
      handoverProject = exporter.projectFromJson(handoverText);
    } catch (error) {
      // A leftover from an earlier visit has another format than this release: it is not for this tracker.
      handoverError = error instanceof OlderFormatError || error instanceof NewerFormatError
        ? 'It was meant for another release of the tracker, so it was ignored.'
        : error.message;
    }
  }
  const linkedDemo = link.demo ? findDemo(link.demo) : null;
  const project = handoverProject ?? (linkedDemo ? linkedDemo.build() : saved ?? findDemo(FIRST_START_DEMO).build());
  // A demo link, a handed-over file or an autosave that is not understood must not overwrite the project this
  // browser has saved: nothing is autosaved until the person changes something (or opens, creates or loads
  // something themselves).
  let autosaveHeld = autosave.kind !== 'none' && project !== saved;
  // An older autosave stays untouched until the person has decided (the dialog opens only when the page is ready).
  if (autosave.kind === 'older') autosaveLock.hold();
  const persist = (current) => { if (!autosaveHeld) saveAutosave(current); };
  const store = createStore(project);
  let savedJson = exporter.projectToJson(project);   // what is on disk (or the start), for the "unsaved" check

  let symbols = {};
  try {
    symbols = await fetchJson('../player/symbols.json');
  } catch (error) {
    messages.show('symbols', 'warn', 'The player symbols could not be loaded.',
      [`${error.message}. Playing may fail, and play-from-cursor and live speed changes will not work.`]);
  }

  const session = createSession({
    store,
    symbols,
    model: { ...projectModel, ...serialiser },
    createEngineClient,
    on: {
      problems: showProblems,
      sizes: showSizes,
      mode: showMode,
      error: (text) => { messages.show('engine', 'error', text); $('audio-status').textContent = text; },
      notice: (text) => messages.show('notice', 'warn', text, [], { timeoutMs: 4000 }),
      meter: (peak) => {
        if (session.mode === 'idle') return;     // the last state message after a stop must not light the meter
        $('meter').style.width = `${Math.min(100, Math.round(peak * 140))}%`;
      },
      engine: ({ sampleRate }) => {
        messages.clear('engine');
        $('audio-status').textContent = `Audio ready, ${sampleRate} Hz.`;
      },
    },
  });

  // ---- header: song name and speed ------------------------------------------------

  const nameInput = $('song-name');
  const speedInput = $('speed');

  nameInput.addEventListener('input', () => {
    store.update('rename song', (p) => { p.song.name = nameInput.value; }, { merge: 'song-name' });
  });

  speedInput.addEventListener('input', () => {
    const value = Number(speedInput.value);
    if (Number.isInteger(value) && value >= 1 && value <= 255) {
      store.update('change speed', (p) => { p.song.speed = value; }, { merge: 'speed' });
    }
  });
  speedInput.addEventListener('blur', syncFields);     // out of range or empty: put the real value back

  function syncFields() {
    const { song } = store.project;
    if (document.activeElement !== nameInput) nameInput.value = song.name;
    if (document.activeElement !== speedInput) speedInput.value = song.speed;
    $('tempo').textContent = `${Math.round((PAL_FRAMES_PER_SECOND * 60) / (4 * song.speed))} bpm`;
    document.title = `${isDevChannel(location.pathname) ? '[dev] ' : ''}${song.name || 'untitled'} - WebSidTracker`;
    const undo = $('btn-undo');
    const redo = $('btn-redo');
    undo.disabled = !store.canUndo();
    redo.disabled = !store.canRedo();
    undo.title = store.canUndo() ? `Undo: ${store.undoLabel()} (Ctrl/Cmd+Z)` : 'Nothing to undo';
    redo.title = store.canRedo() ? `Redo: ${store.redoLabel()} (Ctrl/Cmd+Shift+Z)` : 'Nothing to redo';
  }

  // ---- transport, chip, volume, mutes ----------------------------------------------

  // A button that was clicked keeps the focus, and Space would then press it again.
  // Clicks by mouse give the focus back to the page; keyboard use is left alone.
  function onClick(id, handler) {
    $(id).addEventListener('click', (event) => {
      if (event.detail > 0) event.currentTarget.blur();
      handler();
    });
  }

  onClick('btn-play', () => store.play({ fromCursor: false }));
  onClick('btn-cursor', () => store.play({ fromCursor: true }));
  onClick('btn-stop', () => store.stop());

  function togglePlay(fromCursor) {
    if (session.mode === 'song' && !fromCursor) store.stop();
    else store.play({ fromCursor });
  }

  $('chip').addEventListener('change', (event) => session.setChipModel(Number(event.target.value)));
  $('volume').addEventListener('input', (event) => session.setVolume(Number(event.target.value)));
  for (let voice = 0; voice < 3; voice++) {
    const button = $(`mute-${voice}`);
    button.addEventListener('click', () => {
      const muted = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(muted));
      session.setMuted(voice, muted);
    });
  }

  function showMode(mode) {
    $('btn-play').classList.toggle('active', mode === 'song');
    $('btn-stop').disabled = mode === 'idle';
    if (mode === 'idle') $('meter').style.width = '0';
  }
  showMode('idle');

  function showSizes(info) {
    const low = info.free < 1000;
    const parts = [
      ['Song ', `${info.song} B`], ['Instruments ', `${info.instruments} B`], ['Free ', `${(info.free / 1024).toFixed(1)} KB`, low],
    ];
    $('sizes').replaceChildren(...parts.map(([label, value, warn]) => {
      const part = document.createElement('span');
      const strong = document.createElement('b');
      strong.textContent = value;
      if (warn) strong.className = 'low';
      part.append(label, strong);
      return part;
    }));
  }

  function showProblems(list) {
    if (list.length === 0) messages.clear('problems');
    else messages.show('problems', 'warn', 'This project has problems. Playback keeps the last good version.', list, { dismissible: false });
  }

  // ---- file menu ---------------------------------------------------------------------

  const isDirty = () => exporter.projectToJson(store.project) !== savedJson;

  function replaceProject(next, notice) {
    autosaveLock.release();
    store.load(next);
    savedJson = exporter.projectToJson(next);
    autosaveHeld = false;
    saveAutosave(next);
    if (notice) messages.show('file', 'info', notice, [], { timeoutMs: 4000 });
    messages.clear('demo');
  }

  // A project file that is older than this tracker: say what porting would lose, then let the person choose.
  async function offerUpgrade(info, originalText, source) {
    const root = siteRoot(location.pathname);
    const releases = await loadReleases(root);
    const oldRelease = releases ? pickRelease(releases, info.fromFormat) : null;
    const storage = sessionStore();
    const canHandOver = putHandover(storage, '') && takeHandover(storage) !== null;
    const description = describeUpgrade(info, {
      currentFormat: FORMAT, currentRelease: RELEASE, oldRelease: oldRelease ? oldRelease.release : null, canHandOver, source,
    });
    const choice = await askUpgrade($('upgrade-dialog'), description);
    if (choice === 'port') {
      if (description.saveOriginal) download(`${slug(info.project.song.name, 'project')}-format-${info.fromFormat}.json`, originalText, 'application/json');
      store.stop();
      replaceProject(info.project, `Ported from format ${info.fromFormat} to format ${FORMAT}. The file you opened is not changed; Save makes a new file.`);
      savedJson = '';                                   // not on disk yet: counts as unsaved
    } else if (choice === 'old') {
      persist(store.project);                           // leaving the page must not lose the current project
      if (!putHandover(storage, originalText)) {
        messages.show('file', 'error', 'The file could not be handed to the old tracker.', ['The browser blocks storage.']);
        return;
      }
      location.assign(frozenUrl(root, oldRelease.release));
    } else if (source === 'autosave') {
      messages.show('autosave', 'info', 'Your saved project is kept as it is.',
        ['It is older than this tracker. Autosave stays off until you open, create or load something.']);
    }
  }

  onClick('btn-new', () => {
    if (isDirty() && !window.confirm('Discard the changes since the last save and start a new project?')) return;
    replaceProject(projectModel.newProject(), 'New project.');
  });

  // ---- demos -----------------------------------------------------------------------

  const demoSelect = $('demo-select');
  for (const demo of DEMOS) {
    const option = document.createElement('option');
    option.value = demo.id;
    option.textContent = demoLabel(demo);
    option.title = demo.note;
    demoSelect.append(option);
  }

  function loadDemo(demo) {
    store.stop();
    replaceProject(demo.build(), `Loaded the demo "${demo.title}". ${demo.note}`);
  }

  demoSelect.addEventListener('change', () => {
    const demo = findDemo(demoSelect.value);
    demoSelect.value = '';              // the menu always shows its prompt, so the same demo can be chosen again
    demoSelect.blur();
    if (!demo) return;
    if (!isDirty()) { loadDemo(demo); return; }
    messages.show('demo', 'warn', `Load "${demo.title}" and discard the changes since the last load or save?`, [], {
      dismissible: false,
      actions: [
        { label: 'Load demo', primary: true, run: () => loadDemo(demo) },
        { label: 'Keep my project', run: () => {} },
      ],
    });
  });

  onClick('btn-open', () => $('file-input').click());
  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';            // the same file can be chosen again
    if (!file) return;
    try {
      const text = await readText(file);
      const info = inspectProject(text);
      if (info.status === 'current') replaceProject(info.project, `Opened ${file.name}.`);
      else await offerUpgrade(info, text, 'file');
    } catch (error) {
      messages.show('file', 'error', `Could not open ${file.name}. The current project is unchanged.`, [error.message]);
    }
  });

  function saveFile() {
    try {
      const text = exporter.projectToJson(store.project);
      download(`${slug(store.project.song.name)}.json`, text, 'application/json');
      savedJson = text;
      messages.show('file', 'info', 'Project saved.', [], { timeoutMs: 2500 });
    } catch (error) {
      messages.show('file', 'error', 'Could not save the project.', [error.message]);
    }
  }
  onClick('btn-save', saveFile);

  // ---- export ----------------------------------------------------------------------

  let playerPrg = null;
  async function openExport() {
    const problems = projectModel.validate(store.project);
    if (problems.length > 0) {
      messages.show('export', 'error', 'The project has problems, fix them before exporting.', problems);
      return;
    }
    try {
      if (!playerPrg) {
        const response = await fetch(new URL('../player/player.prg', import.meta.url));
        if (!response.ok) throw new Error(`player.prg: HTTP ${response.status}`);
        playerPrg = new Uint8Array(await response.arrayBuffer());
      }
      const { song } = store.project;
      const name = slug(song.name);
      renderExport($('export-body'), [
        { name: 'instruments.asm', data: exporter.exportInstrumentsAsm(store.project.instruments), text: true, mime: 'text/plain',
          what: 'The instrument tables, shared by all your songs.' },
        { name: `song_${name}.asm`, data: exporter.exportSongAsm(song, name), text: true, mime: 'text/plain',
          what: 'This song. Start it with lda #<song / ldx #>song / jsr music_init.' },
        { name: `${name}.prg`, data: exporter.exportPrg(store.project, playerPrg), text: false, mime: 'application/octet-stream',
          what: 'Ready to run on a C64 or in VICE: load it and RUN.' },
      ], (text) => messages.show('file', 'info', text, [], { timeoutMs: 2500 }));
      messages.clear('export');
      $('export-dialog').showModal();
    } catch (error) {
      messages.show('export', 'error', 'The export failed.', [error.message]);
    }
  }
  onClick('btn-export', openExport);

  // ---- history and help -----------------------------------------------------------------

  onClick('btn-undo', () => store.undo());
  onClick('btn-redo', () => store.redo());

  // The manual dialog (the same text as manual.html). The key tables are read from the editor
  // modules once, in the background, so the dialog opens at once.
  let keySources = null;
  const keySourcesReady = loadKeySources().then((sources) => { keySources = sources; return sources; });
  const manual = createManualDialog({
    dialog: $('manual-dialog'),
    sections: SECTIONS,
    getKeySources: () => (keySources ? Promise.resolve(keySources) : keySourcesReady),
    fallbackFocus: () => $('editor-pane'),
  });
  const openHelp = (sectionId) => manual.open(sectionId);
  onClick('btn-help', () => openHelp());

  // ---- keyboard --------------------------------------------------------------------------

  const typingInField = (target) => target instanceof HTMLElement
    && (target.isContentEditable || target.matches('textarea, select, input:not([type="range"]):not([type="checkbox"]):not([type="button"])'));

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (command && key === 's') {
      event.preventDefault();
      saveFile();
    } else if (command && key === 'z' && !typingInField(event.target)) {
      event.preventDefault();
      if (event.shiftKey) store.redo(); else store.undo();
    } else if (command && key === 'y' && !typingInField(event.target)) {
      event.preventDefault();
      store.redo();
    } else if (event.key === ' ' && !command && !event.altKey && !typingInField(event.target)
      && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      togglePlay(event.shiftKey);
    } else if (event.key === '?' && !typingInField(event.target)) {
      event.preventDefault();
      openHelp();
    }
  });

  // Audio can only start after a click or key press: get the engine going on the first one,
  // so the first note is not late.
  const warmUp = () => { session.ensureEngine(); };
  window.addEventListener('pointerdown', warmUp, { once: true });
  window.addEventListener('keydown', warmUp, { once: true });

  // ---- autosave and field sync ---------------------------------------------------------------

  let saveTimer = 0;
  store.subscribe((change) => {
    if (change.kind === 'playhead' || change.kind === 'select') return;
    syncFields();
    autosaveHeld = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveAutosave(store.project), 500);
  });
  window.addEventListener('pagehide', () => persist(store.project));
  syncFields();

  // ---- the two big parts ------------------------------------------------------------------------
  // Loaded one by one, so that a failure in one of them leaves the rest of the page usable.

  async function mountPart(paneId, path, mountName, title) {
    const pane = $(paneId);
    try {
      const module = await import(path);
      module[mountName](pane, store);
    } catch (error) {
      console.error(error);
      pane.innerHTML = '';
      const failed = document.createElement('div');
      failed.className = 'pane-failed';
      failed.textContent = `${title} could not start: ${error.message}`;
      pane.append(failed);
    }
  }

  await Promise.all([
    mountPart('editor-pane', '../ui/editor.js', 'mountEditor', 'Pattern editor'),
    mountPart('instrument-pane', '../ui/instruments.js', 'mountInstruments', 'Instrument editor'),
  ]);

  // ---- release label, development bar ----------------------------------------------------------------

  $('release').textContent = `v${RELEASE}`;
  $('footer-version').textContent = `release ${RELEASE}, format ${FORMAT}${isDevChannel(location.pathname) ? ' (development)' : ''}`;
  $('dev-bar').hidden = !isDevChannel(location.pathname);

  // ---- first visit, deep links ---------------------------------------------------------------------

  if (handoverError) {
    messages.show('file', 'error', 'The file handed over from the other tracker could not be opened.', [handoverError]);
  } else if (handoverProject) {
    messages.show('file', 'info', `Your file is open in release ${RELEASE}, the release that matches its format.`, [], { timeoutMs: 6000 });
  }
  if (link.demo && !linkedDemo) {
    messages.show('demo', 'warn', `There is no demo called "${link.demo}".`,
      [`Showing ${saved ? 'your saved project' : 'the first demo'} instead. The Demos menu lists the demos: ${DEMOS.map((demo) => demo.id).join(', ')}.`]);
  } else if (linkedDemo) {
    messages.show('demo', 'info', `Loaded the demo "${linkedDemo.title}". ${linkedDemo.note}`,
      saved ? ['Your own project is still saved in this browser. It is kept until you change something here.'] : []);
  }

  if (link.help !== null) {
    openHelp(link.help);
  } else if (!saved && !handoverProject && autosave.kind === 'none' && !welcomeDismissed()) {
    messages.show('welcome', 'info', 'Welcome to WebSidTracker.', [
      'Press Play (or Space) to hear the song, then change notes while it plays.',
      'Click the pattern grid and play notes on your keyboard like a piano: Z S X D C V G B H N J M is the lower octave, Q 2 W 3 E R 5 T 6 Y 7 U the upper one.',
      'Your work is kept in this browser automatically. Use Save to keep a file.',
    ], { onDismiss: rememberWelcomeDismissed, actions: [{ label: 'Open the quick start', primary: true, run: () => openHelp('quick-start') }] });
  }

  // Only ask when the person came to open their own saved project: after a demo link or a handed-over file the
  // older autosave is left alone (the lock stays on) and is offered at the next normal visit.
  if (autosave.kind === 'older' && !handoverProject && !linkedDemo) await offerUpgrade(autosave.info, autosave.text, 'autosave');
}

main().catch((error) => {
  console.error(error);
  const failed = document.createElement('div');
  failed.className = 'pane-failed';
  failed.textContent = `The tracker could not start: ${error.message}`;
  document.body.prepend(failed);
});
