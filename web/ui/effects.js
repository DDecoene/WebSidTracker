// effects.js - the Effects view: the list of sound effects, the fields of the selected one (name, speed,
// the voice it is played on in the tracker) and the pattern editor in one-voice mode for its notes.
//
// The pattern editor only knows songs. createEffectStore gives it a store that shows the selected effect
// as a song with one pattern on voice 1, and turns every edit of that pattern into an edit of the effect
// in the real store (one undo step each, as in the song). The instrument, octave, step and note length
// are shared with the song editor; the cursor is the effect editor's own.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { mountEditor } from './editor.js';
import { defaultEffect, LIMITS } from '../model/project.js';
import { effectBytes } from '../model/serialise.js';

const SHARED = ['instrument', 'octave', 'step', 'defaultLength'];
const IDLE = { running: false, voices: [null, null, null], frameInTick: 0 };
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/**
 * A store for the pattern editor that shows effect `index` of `store.project.effects` as a one-pattern song.
 * @returns the store, plus setIndex(i) and get index
 */
export function createEffectStore(store) {
  let index = 0;
  const own = { voice: 0, orderIndex: 0, eventIndex: 0 };
  const listeners = new Set();
  let cache = { source: null, index: -1, project: null };

  const effects = () => store.project.effects ?? [];
  const notify = (change) => { for (const fn of [...listeners]) fn(change); };

  // The same object as long as neither the project nor the index changed: the editor keys its caches on it.
  function view() {
    if (cache.source === store.project && cache.index === index) return cache.project;
    const effect = effects()[index];
    const project = {
      instruments: store.project.instruments,
      song: {
        name: effect ? effect.name : '',
        speed: effect ? effect.speed : 1,
        patterns: [{ name: effect ? effect.name : '', events: effect ? effect.events : [] }],
        orders: [[{ pattern: 0, transpose: 0 }], [{ stop: true }], [{ stop: true }]],
      },
    };
    cache = { source: store.project, index, project };
    return project;
  }

  store.subscribe((change) => {
    if (change.kind === 'playhead') return;          // the song's playhead means nothing here
    notify(change);
  });

  const fx = {
    playhead: IDLE,
    get engineReady() { return store.engineReady; },
    get project() { return view(); },
    get selection() {
      const shared = Object.fromEntries(SHARED.map((key) => [key, store.selection[key]]));
      return { ...own, ...shared };
    },
    get index() { return index; },

    setIndex(i) {
      const next = Math.max(0, Math.min(i, Math.max(0, effects().length - 1)));
      if (next === index && cache.index === index) return;
      index = next;
      own.eventIndex = 0;
      notify({ kind: 'load', label: 'select effect' });
    },

    select(partial) {
      const shared = {};
      let changed = false;
      for (const [key, value] of Object.entries(partial)) {
        if (SHARED.includes(key)) shared[key] = value;
        else if (key === 'eventIndex' && own.eventIndex !== value) { own.eventIndex = value; changed = true; }
      }
      if (Object.keys(shared).length) store.select(shared);       // the main store tells us (and the editor)
      if (changed) notify({ kind: 'select', label: 'select' });
    },

    update(label, mutator, options) {
      if (!effects()[index]) return;
      const draft = structuredClone(view());
      mutator(draft);
      const events = draft.song.patterns[0] ? draft.song.patterns[0].events : [];
      const at = index;
      store.update(label, (project) => { project.effects[at].events = events; }, options);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    auditionNote: (instrument, pitch) => store.auditionNote(instrument, pitch),
    play: () => {},
    stop: () => {},
  };
  return fx;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** Mount the Effects view in `container`. Returns { playSelected(), focusEditor(), destroy() }. */
export function mountEffects(container, store) {
  const fx = createEffectStore(store);
  container.classList.add('fx');
  container.innerHTML = `
    <aside class="fx-side" aria-label="Sound effects">
      <div class="fx-tools">
        <button type="button" data-act="new" title="A new effect at the end of the list">New</button>
        <button type="button" data-act="duplicate" title="A copy of the selected effect, right after it">Duplicate</button>
        <button type="button" data-act="delete" title="Delete the selected effect. The effects after it move up one number">Delete</button>
        <button type="button" data-act="up" title="Move the selected effect up (its number goes down)" aria-label="Move up">&uarr;</button>
        <button type="button" data-act="down" title="Move the selected effect down (its number goes up)" aria-label="Move down">&darr;</button>
      </div>
      <ol class="fx-list" data-role="list" role="listbox" aria-label="Effects"></ol>
      <p class="fx-note" data-role="note"></p>
    </aside>
    <div class="fx-main">
      <div class="fx-fields" data-role="fields">
        <label class="fx-field grow"><span>Name</span><input data-role="name" type="text" maxlength="40" spellcheck="false" autocomplete="off"
          title="The name. The export makes a constant of it: Big boom becomes SFX_BIG_BOOM"></label>
        <label class="fx-field"><span>Speed</span><input data-role="speed" type="number" min="1" max="255" step="1" inputmode="numeric"
          title="Frames per tick (1 to 255). At 1 every tick is a frame: the lengths of the notes are in frames"></label>
        <label class="fx-field"><span>Voice</span><select data-role="voice"
          title="The voice the tracker plays this effect on. In a game you pick the voice when you call sfx_play; the export keeps this one in sfx_voice as a suggestion">
          <option value="0">1</option><option value="1">2</option><option value="2">3</option></select></label>
        <button type="button" class="play" data-act="play" title="Play this effect on its voice, over the song if it plays (Ctrl/Cmd+Enter)">Play effect</button>
      </div>
      <div class="fx-editor pane-inner" data-role="editor"></div>
      <div class="fx-empty" data-role="empty" hidden>
        <p>No sound effects yet.</p>
        <p>A sound effect is a short line of notes that a game plays over its music, on one voice: a shot, a jump, an explosion.
          Press <b>New</b> to make one. Its notes are entered like a pattern; the instrument does the sound.</p>
      </div>
    </div>`;
  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const listEl = $('list');
  const nameInput = $('name');
  const speedInput = $('speed');
  const voiceSelect = $('voice');
  const editorEl = $('editor');
  const emptyEl = $('empty');
  const fieldsEl = $('fields');
  const noteEl = $('note');

  const effects = () => store.project.effects ?? [];
  const current = () => effects()[fx.index] ?? null;
  const editor = mountEditor(editorEl, fx, { single: true });

  function select(i) {
    fx.setIndex(i);
    render();
  }

  function change(label, mutate, merge) {
    const at = fx.index;
    if (!effects()[at]) return;
    store.update(label, (project) => mutate(project.effects[at]), merge ? { merge } : undefined);
  }

  const actions = {
    new() {
      let added = 0;
      store.update('new effect', (project) => {
        project.effects = project.effects ?? [];
        const effect = defaultEffect(`Effect ${project.effects.length + 1}`);
        effect.events[0].instrument = store.selection.instrument ?? 0;
        if (!project.instruments[effect.events[0].instrument]) effect.events[0].instrument = project.instruments.findIndex(Boolean);
        project.effects.push(effect);
        added = project.effects.length - 1;
      });
      select(added);
      nameInput.focus();
      nameInput.select();
    },
    duplicate() {
      const at = fx.index;
      if (!effects()[at]) return;
      store.update('duplicate effect', (project) => {
        const copy = structuredClone(project.effects[at]);
        copy.name = `${copy.name} copy`;
        project.effects.splice(at + 1, 0, copy);
      });
      select(at + 1);
    },
    delete() {
      const at = fx.index;
      if (!effects()[at]) return;
      store.update('delete effect', (project) => { project.effects.splice(at, 1); });
      select(Math.min(at, effects().length - 1));
    },
    up() { move(-1); },
    down() { move(1); },
    play() { playSelected(); },
  };

  function move(direction) {
    const at = fx.index;
    const to = at + direction;
    if (!effects()[at] || to < 0 || to >= effects().length) return;
    store.update('move effect', (project) => {
      const [effect] = project.effects.splice(at, 1);
      project.effects.splice(to, 0, effect);
    });
    select(to);
  }

  function playSelected() {
    if (current() && store.playEffect) store.playEffect(fx.index);
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (button && actions[button.dataset.act]) {
      if (event.detail > 0) button.blur();
      actions[button.dataset.act]();
      return;
    }
    const item = event.target.closest('[data-i]');
    if (item) select(Number(item.dataset.i));
  });
  listEl.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-i]')) playSelected();
  });
  listEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      select(fx.index + (event.key === 'ArrowUp' ? -1 : 1));
      listEl.querySelector('[aria-selected="true"]')?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      playSelected();
    }
  });

  nameInput.addEventListener('input', () => change('rename effect', (effect) => { effect.name = nameInput.value; }, 'effect-name'));
  speedInput.addEventListener('input', () => {
    const value = Number(speedInput.value);
    if (Number.isInteger(value) && value >= LIMITS.minSpeed && value <= LIMITS.maxSpeed) {
      change('effect speed', (effect) => { effect.speed = value; }, 'effect-speed');
    }
  });
  speedInput.addEventListener('blur', render);
  voiceSelect.addEventListener('change', () => change('effect voice', (effect) => { effect.voice = Number(voiceSelect.value); }));

  function render() {
    const list = effects();
    if (fx.index >= list.length && list.length) fx.setIndex(list.length - 1);
    const items = list.map((effect, i) => {
      const item = el('li', { 'data-i': String(i), role: 'option', tabindex: i === fx.index ? '0' : '-1',
        'aria-selected': String(i === fx.index), title: `Effect ${i}: ${effect.name || '(no name)'}, voice ${effect.voice + 1}` },
      el('b', { text: hex2(i) }), el('span', { text: effect.name || '(no name)' }), el('i', { text: `V${effect.voice + 1}` }));
      return item;
    });
    listEl.replaceChildren(...items);
    const effect = current();
    emptyEl.hidden = Boolean(effect);
    editorEl.hidden = !effect;
    fieldsEl.classList.toggle('off', !effect);
    for (const input of [nameInput, speedInput, voiceSelect]) input.disabled = !effect;
    container.querySelectorAll('[data-act="duplicate"], [data-act="delete"], [data-act="up"], [data-act="down"], [data-act="play"]')
      .forEach((button) => { button.disabled = !effect; });
    if (effect) {
      if (document.activeElement !== nameInput) nameInput.value = effect.name;
      if (document.activeElement !== speedInput) speedInput.value = effect.speed;
      voiceSelect.value = String(effect.voice);
    }
    const total = list.reduce((sum, e) => sum + effectBytes(e), 0);
    noteEl.textContent = `${list.length} of ${LIMITS.maxEffects} effects, ${total} bytes.`;
  }

  const unsubscribe = store.subscribe((change) => {
    if (change.kind === 'playhead' || change.kind === 'select') return;
    if (change.kind === 'load') fx.setIndex(0);
    render();
  });
  render();

  return {
    playSelected,
    focusEditor() { (current() ? editorEl : listEl).focus(); },
    destroy() {
      unsubscribe();
      editor.destroy();
    },
  };
}
