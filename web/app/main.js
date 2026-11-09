// main.js - starts the tracker: loads the project, creates the store and the audio session,
// mounts the pattern editor and the instrument panel, and wires the header, the dialogs and
// the keyboard shortcuts.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { createStore } from './store.js';
import { createSession } from './session.js';
import { createMessages, renderHelp, renderExport } from './panels.js';
import { slug, readText, download } from './files.js';
import * as projectModel from '../model/project.js';
import * as serialiser from '../model/serialise.js';
import * as exporter from '../model/export.js';
import { createEngineClient } from '../engine/client.js';

const AUTOSAVE_KEY = 'websidtracker.autosave.v1';
const PAL_FRAMES_PER_SECOND = 985248 / 19656;

const $ = (id) => document.getElementById(id);

// ---- storage that may be blocked -------------------------------------------

function loadAutosave() {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (text) return exporter.projectFromJson(text);
  } catch {
    // blocked storage or a damaged save: start from the demo
  }
  return null;
}

function saveAutosave(project) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, exporter.projectToJson(project));
  } catch {
    // blocked or full: the user can still use Save
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
  const project = loadAutosave() ?? projectModel.demoProject();
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
      meter: (peak) => { $('meter').style.width = `${Math.min(100, Math.round(peak * 140))}%`; },
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
    document.title = `${song.name || 'untitled'} - WebSidTracker`;
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
    store.load(next);
    savedJson = exporter.projectToJson(next);
    saveAutosave(next);
    if (notice) messages.show('file', 'info', notice, [], { timeoutMs: 4000 });
  }

  onClick('btn-new', () => {
    if (isDirty() && !window.confirm('Discard the changes since the last save and start a new project?')) return;
    replaceProject(projectModel.newProject(), 'New project.');
  });

  onClick('btn-open', () => $('file-input').click());
  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';            // the same file can be chosen again
    if (!file) return;
    try {
      const next = exporter.projectFromJson(await readText(file));
      replaceProject(next, `Opened ${file.name}.`);
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

  const shellKeys = [
    ['Space', 'Play the song from the start / stop'],
    ['Shift+Space', 'Play from the cursor'],
    ['Ctrl+Z / Cmd+Z', 'Undo'],
    ['Ctrl+Shift+Z / Ctrl+Y / Cmd+Shift+Z', 'Redo'],
    ['Ctrl+S / Cmd+S', 'Save the project as a file'],
    ['?', 'Show this help'],
  ];

  const helpSections = [{ title: 'Everywhere', keys: shellKeys }];

  function openHelp() {
    renderHelp($('help-body'), helpSections);
    $('help-dialog').showModal();
  }
  onClick('btn-help', openHelp);

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
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveAutosave(store.project), 500);
  });
  window.addEventListener('pagehide', () => saveAutosave(store.project));
  syncFields();

  // ---- the two big parts ------------------------------------------------------------------------
  // Loaded one by one, so that a failure in one of them leaves the rest of the page usable.

  async function mountPart(paneId, path, mountName, keysName, title) {
    const pane = $(paneId);
    try {
      const module = await import(path);
      module[mountName](pane, store);
      if (typeof module[keysName] === 'function') helpSections.push({ title, keys: module[keysName]() });
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
    mountPart('editor-pane', '../ui/editor.js', 'mountEditor', 'keyHelp', 'Pattern editor'),
    mountPart('instrument-pane', '../ui/instruments.js', 'mountInstruments', 'instrumentKeyHelp', 'Instrument editor'),
  ]);
  // the editor's keys come first after the shell's own, whatever order the modules finished in
  helpSections.sort((a, b) => ['Everywhere', 'Pattern editor', 'Instrument editor'].indexOf(a.title)
    - ['Everywhere', 'Pattern editor', 'Instrument editor'].indexOf(b.title));
}

main().catch((error) => {
  console.error(error);
  const failed = document.createElement('div');
  failed.className = 'pane-failed';
  failed.textContent = `The tracker could not start: ${error.message}`;
  document.body.prepend(failed);
});
