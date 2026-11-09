// editor.js - the pattern and order editor: three voices side by side, an order
// list per voice on top, the pattern of the chosen order entry as a grid below.
//
// The grid is a view of the event list (see editor-logic.js, which holds all the
// editing rules). This file does the DOM, the keyboard and the mouse, and sends
// every change through store.update. It never touches the project directly.
//
// Where state lives:
//   store.selection  voice, orderIndex, eventIndex, instrument, octave, step,
//                    defaultLength (shared with the rest of the app)
//   here             the cursor ROW inside the pattern (a sustained note has many
//                    rows but one event, so the row cannot live in the store), the
//                    order entry shown for each voice, which part has the keyboard
//                    (grid or order list), the "follow the song" switch.
//
// Only the rows that can be seen are built, so a pattern with thousands of ticks
// stays fast. Row height is fixed (ROW_H) for that reason.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import {
  MAX_LENGTH, MAX_PATTERNS, MAX_PITCH, addPattern, assignPattern, buildLayout, clearAt, deleteEntry,
  duplicatePattern, enterNote, enterRest, entryKind, entryLabel, eventIndexAtRow, insertEntry, insertRow,
  deleteRow, keyHelp, noteLabel, patternUsers, pianoSemitone, playRow, removePattern, rowOfEvent,
  setEntryLoop, setEntryStop, setEntryTranspose, setLoopTarget, setNoteInstrument, setRunLength,
  toggleLegato, transposeNote, typeHexDigit,
} from './editor-logic.js';

export { keyHelp };

const ROW_H = 20;          // px, the same for every grid row
const HEAD_H = 30;         // px, the sticky header with the voice names
const EXTRA_ROWS = 8;      // empty space after the last row so the end can scroll up

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mountEditor(container, store) {
  const ui = {
    zone: 'pattern',               // which part has the keyboard: 'pattern' or 'order'
    row: 0,                        // cursor row in the pattern of the selected voice
    shown: [0, 0, 0],              // order entry shown per voice
    follow: true,
    instEntry: null,               // while typing an instrument number: the digits so far
    reveal: false,                 // scroll the cursor into view at the next render
    message: '',
    messageTimer: 0,
    playSignature: '',
  };
  let selfSelecting = false;
  const layoutCache = new WeakMap();   // events array -> layout (arrays are never mutated)

  // ---- the DOM, built once ---------------------------------------------------------

  container.classList.add('ed');
  container.tabIndex = 0;
  container.setAttribute('aria-label', 'Pattern editor');
  container.style.setProperty('--ed-row-h', `${ROW_H}px`);
  container.style.setProperty('--ed-head-h', `${HEAD_H}px`);
  container.innerHTML = `
    <div class="ed-bar">
      <span class="ed-status" data-role="status"></span>
      <label class="ed-follow"><input type="checkbox" data-role="follow" checked> Follow</label>
      <span class="ed-buttons">
        <button type="button" data-act="newPattern" title="New empty pattern for this entry (Shift+N)">New pattern</button>
        <button type="button" data-act="duplicatePattern" title="Duplicate this pattern (Shift+D)">Duplicate</button>
        <button type="button" data-act="deletePattern" title="Delete this pattern (Shift+X)">Delete pattern</button>
        <button type="button" data-act="insertEntry" title="Insert an order entry after this one">Insert entry</button>
        <button type="button" data-act="deleteEntry" title="Delete this order entry">Delete entry</button>
      </span>
      <label class="ed-name">Pattern name <input type="text" data-role="name" maxlength="24" size="14"></label>
      <span class="ed-msg" role="status" aria-live="polite" data-role="message"></span>
    </div>
    <div class="ed-orders" data-role="orders">
      <div class="ed-gutter">order</div>
      <div class="ed-order" data-v="0"></div>
      <div class="ed-order" data-v="1"></div>
      <div class="ed-order" data-v="2"></div>
    </div>
    <div class="ed-scroll" data-role="scroll">
      <div class="ed-head" data-role="head"></div>
      <div class="ed-rows" data-role="rows"></div>
    </div>`;
  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const statusEl = $('status');
  const followBox = $('follow');
  const nameInput = $('name');
  const messageEl = $('message');
  const scroller = $('scroll');
  const headEl = $('head');
  const rowsEl = $('rows');
  const orderEls = [...container.querySelectorAll('.ed-order')];

  // ---- reading the project -----------------------------------------------------------

  const song = () => store.project.song;
  const sel = () => store.selection;
  const voiceOf = () => clamp(sel().voice | 0, 0, 2);
  const entryOf = (v) => song().orders[v][ui.shown[v]];
  const patternIndexOf = (v) => {
    const entry = entryOf(v);
    return entryKind(entry) === 'pattern' && song().patterns[entry.pattern] ? entry.pattern : -1;
  };
  const patternOf = (v) => song().patterns[patternIndexOf(v)] || null;
  function layoutOf(v) {
    const pattern = patternOf(v);
    if (!pattern) return null;
    let layout = layoutCache.get(pattern.events);
    if (!layout) {
      layout = buildLayout(pattern.events);
      layoutCache.set(pattern.events, layout);
    }
    return layout;
  }
  const totalOf = (v) => (layoutOf(v) ? layoutOf(v).total : 0);

  // Keep every index inside what exists (after undo, load, deleting things...).
  function normalise() {
    for (let v = 0; v < 3; v++) ui.shown[v] = clamp(ui.shown[v], 0, Math.max(0, song().orders[v].length - 1));
    ui.row = clamp(ui.row, 0, totalOf(voiceOf()));
  }

  // ---- telling the store where the cursor is ------------------------------------------

  function syncSelection() {
    const v = voiceOf();
    const layout = layoutOf(v);
    selfSelecting = true;
    store.select({
      voice: v,
      orderIndex: ui.shown[v],
      eventIndex: layout ? eventIndexAtRow(layout, ui.row) : 0,
    });
    selfSelecting = false;
  }

  // Somebody else moved the selection (a click elsewhere, a loaded project).
  function adoptSelection() {
    const s = sel();
    const v = voiceOf();
    if (Number.isInteger(s.orderIndex) && s.orderIndex !== ui.shown[v]) {
      ui.shown[v] = s.orderIndex;
      ui.row = 0;
    }
    normalise();
    const layout = layoutOf(v);
    if (layout && Number.isInteger(s.eventIndex) && eventIndexAtRow(layout, ui.row) !== s.eventIndex) {
      ui.row = rowOfEvent(layout, s.eventIndex);
    }
    ui.reveal = true;
  }

  function say(text) {
    ui.message = text;
    clearTimeout(ui.messageTimer);
    ui.messageTimer = setTimeout(() => { ui.message = ''; messageEl.textContent = ''; }, 5000);
    messageEl.textContent = text;
  }

  // ---- rendering ---------------------------------------------------------------------

  // Only touch the DOM when the html really changed (keeps scroll and clicks calm).
  function setHtml(el, html) {
    if (el._html === html) return;
    el._html = html;
    el.innerHTML = html;
  }

  function playRows() {
    const ph = store.playhead;
    return [0, 1, 2].map((v) => {
      const p = ph && ph.running && ph.voices ? ph.voices[v] : null;
      const layout = layoutOf(v);
      if (!p || !layout || p.orderIndex !== ui.shown[v]) return -1;
      return playRow(layout, p.eventIndex, p.ticksLeft);
    });
  }

  function renderBar() {
    const s = sel();
    const v = voiceOf();
    const instrument = store.project.instruments[s.instrument];
    const pattern = patternOf(v);
    const patNo = patternIndexOf(v);
    const where = ui.zone === 'order' ? 'order list' : 'pattern';
    const typing = ui.instEntry !== null ? `   instrument: ${ui.instEntry.padEnd(2, '_')}` : '';
    statusEl.textContent =
      `Voice ${v + 1} ${where}  entry ${hex2(ui.shown[v])}  pattern ${patNo >= 0 ? hex2(patNo) : '--'}  row ${hex2(ui.row)}` +
      `  |  octave ${s.octave}  instrument ${hex2(s.instrument)} ${instrument ? instrument.name : '(empty)'}` +
      `  length ${s.defaultLength}  step ${s.step}${typing}`;
    if (document.activeElement !== nameInput) nameInput.value = pattern ? pattern.name || '' : '';
    nameInput.disabled = !pattern;
    followBox.checked = ui.follow;
  }

  function renderOrders() {
    const ph = store.playhead;
    const v0 = voiceOf();
    orderEls.forEach((el, v) => {
      const list = song().orders[v];
      let html = `<div class="ed-oh">Voice ${v + 1}</div>`;
      list.forEach((entry, i) => {
        const classes = ['ed-oe'];
        if (i === ui.shown[v]) classes.push('cur');
        if (i === ui.shown[v] && v === v0) classes.push(ui.zone === 'order' ? 'sel' : 'seldim');
        if (ph && ph.running && ph.voices && ph.voices[v] && ph.voices[v].orderIndex === i) classes.push('play');
        classes.push(`k-${entryKind(entry)}`);
        html += `<div class="${classes.join(' ')}" data-v="${v}" data-i="${i}"><span class="ix">${hex2(i)}</span> ${entryLabel(entry)}</div>`;
      });
      if (!list.length) html += '<div class="ed-oe k-none" data-v="' + v + '" data-i="0">(no entries)</div>';
      setHtml(el, html);
      const cur = el.querySelector('.cur');
      if (cur) {                                   // keep the shown entry inside the little list
        if (cur.offsetTop < el.scrollTop) el.scrollTop = cur.offsetTop;
        else if (cur.offsetTop + cur.offsetHeight > el.scrollTop + el.clientHeight) {
          el.scrollTop = cur.offsetTop + cur.offsetHeight - el.clientHeight;
        }
      }
    });
  }

  function cellHtml(r) {
    if (!r) return '';
    const mark = (inst, legato) =>
      `<span class="in">${inst !== null && inst !== undefined ? hex2(inst) : '  '}</span> <span class="lg">${legato ? 'L' : ' '}</span>`;
    switch (r.kind) {
      case 'note': return `<span class="nt">${noteLabel(r.pitch)}</span> ${mark(r.inst, r.legato)}`;
      case 'rest': return `<span class="rs">---</span> ${mark(r.inst, r.legato)}`;
      case 'sustain': return `<span class="su ${r.of}"> ${r.of === 'note' ? '|' : '·'} </span>`;
      default: return `<span class="en">end</span> ${mark(r.inst, r.legato)}`;
    }
  }

  function renderGrid() {
    const v0 = voiceOf();
    const layouts = [0, 1, 2].map(layoutOf);
    const rowCount = Math.max(...layouts.map((l) => (l ? l.total + 1 : 0)), 1);
    const bodyHeight = (rowCount + EXTRA_ROWS) * ROW_H;
    rowsEl.style.height = `${bodyHeight}px`;
    const viewH = Math.max(0, scroller.clientHeight - HEAD_H);
    const playing = playRows();

    if (ui.follow && store.playhead && store.playhead.running) {
      const followed = playing[v0] >= 0 ? v0 : playing.findIndex((r) => r >= 0);
      if (followed >= 0) {
        scroller.scrollTop = clamp(playing[followed] * ROW_H - viewH / 3, 0, Math.max(0, bodyHeight - viewH));
        ui.reveal = false;
      }
    }
    if (ui.reveal) {
      const y = ui.row * ROW_H;
      if (y < scroller.scrollTop) scroller.scrollTop = y;
      else if (y + ROW_H > scroller.scrollTop + viewH) scroller.scrollTop = y + ROW_H - viewH;
      ui.reveal = false;
    }

    let head = '<div class="ed-rn"></div>';
    layouts.forEach((layout, v) => {
      const n = patternIndexOf(v);
      const pattern = patternOf(v);
      const label = layout
        ? `<b>P${hex2(n)}</b> ${pattern.name ? escapeHtml(pattern.name) : ''}<i>${layout.total} ticks</i>`
        : `<i>${entryKind(entryOf(v)) === 'none' ? 'no entry' : entryLabel(entryOf(v))}</i>`;
      head += `<div class="ed-vh${v === v0 ? ' sel' : ''}">V${v + 1} ${label}</div>`;
    });
    setHtml(headEl, head);

    const first = Math.max(0, Math.floor(scroller.scrollTop / ROW_H) - 2);
    const last = Math.min(rowCount - 1, Math.ceil((scroller.scrollTop + viewH) / ROW_H) + 2);
    let html = '';
    for (let r = first; r <= last; r++) {
      const beat = r % 16 === 0 ? ' b16' : r % 4 === 0 ? ' b4' : '';
      html += `<div class="ed-row${beat}" data-r="${r}" style="top:${r * ROW_H}px"><div class="ed-rn">${hex2(r)}</div>`;
      for (let v = 0; v < 3; v++) {
        const layout = layouts[v];
        const classes = ['ed-c'];
        if (layout && r > layout.total) classes.push('void');
        if (v === v0 && r === ui.row) classes.push(ui.zone === 'pattern' ? 'cursor' : 'cursordim');
        if (playing[v] === r) classes.push('play');
        html += `<div class="${classes.join(' ')}" data-v="${v}">${layout ? cellHtml(layout.rows[r]) : ''}</div>`;
      }
      html += '</div>';
    }
    setHtml(rowsEl, html);
  }

  function render() {
    normalise();
    renderBar();
    renderOrders();
    renderGrid();
  }

  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- cursor movement ---------------------------------------------------------------

  function moveRow(row) {
    ui.row = clamp(row, 0, totalOf(voiceOf()));
    ui.reveal = true;
    syncSelection();
    render();
  }

  function setVoice(v) {
    v = (v + 3) % 3;
    selfSelecting = true;
    store.select({ voice: v });
    selfSelecting = false;
    ui.row = clamp(ui.row, 0, totalOf(v));
    ui.reveal = true;
    syncSelection();
    render();
  }

  function setOrderIndex(i) {
    const v = voiceOf();
    ui.shown[v] = clamp(i, 0, Math.max(0, song().orders[v].length - 1));
    ui.row = 0;
    ui.reveal = true;
    syncSelection();
    render();
  }

  // ---- edits through the store -------------------------------------------------------

  // Run an event-list edit from editor-logic on the pattern of the selected voice.
  // `edit(events)` returns the new events or null. Returns the new list or null.
  function editPattern(label, edit) {
    const v = voiceOf();
    const n = patternIndexOf(v);
    if (n < 0) {
      say('This order entry has no pattern. Press o for the order list, then Shift+N for a new pattern.');
      return null;
    }
    const events = edit(song().patterns[n].events);
    if (!events) return null;
    store.update(label, (draft) => { draft.song.patterns[n].events = events; });
    return events;
  }

  function editSong(label, edit) {
    store.update(label, (draft) => edit(draft.song));
  }

  function enterNoteKey(semitone) {
    const s = sel();
    const pitch = s.octave * 12 + semitone;
    if (pitch > MAX_PITCH) return;
    if (store.auditionNote) store.auditionNote(s.instrument, pitch);
    const events = editPattern('enter note', (ev) =>
      enterNote(ev, ui.row, { pitch, length: s.defaultLength, instrument: s.instrument }));
    if (events) advance(events);
  }

  function enterRestKey() {
    const events = editPattern('enter rest', (ev) => enterRest(ev, ui.row, sel().defaultLength));
    if (events) advance(events);
  }

  function advance(events) {
    const total = buildLayout(events).total;
    ui.row = clamp(ui.row + sel().step, 0, total);
    ui.reveal = true;
    syncSelection();
    render();
  }

  // The length of the note or rest under the cursor.
  function runLengthAtCursor() {
    const layout = layoutOf(voiceOf());
    if (!layout) return 0;
    const row = layout.rows[ui.row];
    if (!row || row.kind === 'end') return 0;
    const head = layout.rows[rowOfEvent(layout, row.event)];
    return head.length;
  }

  function changeRunLength(delta) {
    const length = runLengthAtCursor();
    if (!length) return;
    editPattern('change length', (ev) => setRunLength(ev, ui.row, length + delta));
  }

  function setSelection(partial) {
    selfSelecting = true;
    store.select(partial);
    selfSelecting = false;
    render();
  }

  function stepInstrument(direction) {
    const list = store.project.instruments;
    const current = sel().instrument;
    for (let k = 1; k <= 256; k++) {
      const n = (current + direction * k + 256 * 2) % 256;
      if (list[n]) { setSelection({ instrument: n }); return; }
    }
  }

  function typeInstrumentDigit(digit) {
    ui.instEntry += digit;
    if (ui.instEntry.length === 2) finishInstrumentEntry(true);
    else render();
  }

  function finishInstrumentEntry(apply) {
    const digits = ui.instEntry;
    ui.instEntry = null;
    if (apply && digits) {
      const n = parseInt(digits, 16);
      if (store.project.instruments[n]) setSelection({ instrument: n });
      else say(`Instrument ${hex2(n)} does not exist.`);
    }
    render();
  }

  // ---- pattern and order actions (buttons and keys share them) -----------------------

  const actions = {
    newPattern() {
      if (song().patterns.length >= MAX_PATTERNS) { say(`A song can have at most ${MAX_PATTERNS} patterns.`); return; }
      const v = voiceOf();
      let at = 0;
      store.update('new pattern', (draft) => {
        const n = addPattern(draft.song);
        at = assignPattern(draft.song, v, ui.shown[v], n);
      });
      ui.shown[v] = at;
      ui.row = 0;
      afterPatternChange();
    },

    duplicatePattern() {
      const v = voiceOf();
      const n = patternIndexOf(v);
      if (n < 0) { say('There is no pattern to duplicate here.'); return; }
      if (song().patterns.length >= MAX_PATTERNS) { say(`A song can have at most ${MAX_PATTERNS} patterns.`); return; }
      let at = 0;
      store.update('duplicate pattern', (draft) => {
        const copy = duplicatePattern(draft.song, n);
        at = assignPattern(draft.song, v, ui.shown[v], copy);
      });
      ui.shown[v] = at;
      afterPatternChange();
    },

    // A pattern may only go when no order entry uses it. The one entry you are
    // standing on does not count: it goes too, together with the pattern.
    deletePattern() {
      const v = voiceOf();
      const n = patternIndexOf(v);
      if (n < 0) { say('There is no pattern to delete here.'); return; }
      const others = patternUsers(song(), n).filter((u) => !(u.voice === v && u.index === ui.shown[v]));
      if (others.length) {
        const places = others.slice(0, 4).map((u) => `voice ${u.voice + 1} entry ${hex2(u.index)}`).join(', ');
        say(`Pattern ${hex2(n)} is also used by ${places}${others.length > 4 ? ' ...' : ''}. Change those entries first.`);
        return;
      }
      const at = ui.shown[v];
      store.update('delete pattern', (draft) => {
        deleteEntry(draft.song, v, at);
        removePattern(draft.song, n);
      });
      say(`Deleted pattern ${hex2(n)} and its order entry.`);
      afterPatternChange();
    },

    insertEntry() {
      const v = voiceOf();
      const current = entryOf(v);
      const template = entryKind(current) === 'pattern'
        ? { pattern: current.pattern, transpose: current.transpose }
        : { pattern: 0, transpose: 0 };
      if (!song().patterns.length) { say('Make a pattern first (Shift+N).'); return; }
      const at = song().orders[v].length ? ui.shown[v] + 1 : 0;
      store.update('insert order entry', (draft) => insertEntry(draft.song, v, at, template));
      ui.shown[v] = at;
      ui.row = 0;
      afterPatternChange();
    },

    deleteEntry() {
      const v = voiceOf();
      if (!song().orders[v].length) return;
      store.update('delete order entry', (draft) => deleteEntry(draft.song, v, ui.shown[v]));
      afterPatternChange();
    },
  };

  function afterPatternChange() {
    normalise();
    ui.reveal = true;
    syncSelection();
    render();
  }

  // Keys on the order list.
  function orderKey(e) {
    const v = voiceOf();
    const at = ui.shown[v];
    const entry = entryOf(v);
    const kind = entryKind(entry);
    const patternCount = song().patterns.length;

    const setPattern = (n) => {
      if (kind !== 'pattern' || n < 0 || n >= patternCount) return;
      editSong('set order pattern', (s) => { s.orders[v][at].pattern = n; });
      ui.row = clamp(ui.row, 0, totalOf(v));
      afterPatternChange();
    };
    const step = (delta) => {
      if (kind === 'pattern' && patternCount) setPattern((entry.pattern + delta + patternCount) % patternCount);
      else if (kind === 'loop') editSong('set loop target', (s) => setLoopTarget(s, v, at, entry.loop + delta));
    };
    const transpose = (delta) => {
      if (kind === 'pattern') editSong('set transpose', (s) => setEntryTranspose(s, v, at, entry.transpose + delta));
    };

    switch (e.key) {
      case 'ArrowUp': setOrderIndex(at - 1); return true;
      case 'ArrowDown': setOrderIndex(at + 1); return true;
      case 'Home': setOrderIndex(0); return true;
      case 'End': setOrderIndex(song().orders[v].length - 1); return true;
      case '+': case '=': step(1); return true;
      case '-': case '_': step(-1); return true;
      case '[': transpose(-1); return true;
      case ']': transpose(1); return true;
      case '{': transpose(-12); return true;
      case '}': transpose(12); return true;
      case 'Insert': actions.insertEntry(); return true;
      case 'Delete': case 'Backspace': actions.deleteEntry(); return true;
      case 's': editSong('stop entry', (s) => setEntryStop(s, v, at)); return true;
      case 'l': editSong('loop entry', (s) => setEntryLoop(s, v, at, 0)); return true;
      case 'p':
        if (kind !== 'pattern' && patternCount) {
          editSong('pattern entry', (s) => { s.orders[v][at] = { pattern: 0, transpose: 0 }; });
          afterPatternChange();
        }
        return true;
      case 'Enter': case 'o': ui.zone = 'pattern'; render(); return true;
      default:
    }
    if (e.key.length === 1 && /[0-9a-fA-F]/.test(e.key) && !e.shiftKey) {
      const digit = parseInt(e.key, 16);
      if (kind === 'pattern') {
        const n = typeHexDigit(entry.pattern, digit, patternCount);
        if (n >= 0) setPattern(n);
      } else if (kind === 'loop') {
        const n = typeHexDigit(entry.loop, digit, song().orders[v].length);
        if (n >= 0) editSong('set loop target', (s) => setLoopTarget(s, v, at, n));
      }
      return true;
    }
    return false;
  }

  // Keys on the pattern grid.
  function patternKey(e) {
    const s = sel();
    switch (e.key) {
      case 'ArrowUp':
        if (e.shiftKey) { editPattern('transpose note', (ev) => transposeNote(ev, ui.row, 1)); return true; }
        moveRow(ui.row - 1); return true;
      case 'ArrowDown':
        if (e.shiftKey) { editPattern('transpose note', (ev) => transposeNote(ev, ui.row, -1)); return true; }
        moveRow(ui.row + 1); return true;
      case 'PageUp': moveRow(ui.row - 16); return true;
      case 'PageDown': moveRow(ui.row + 16); return true;
      case 'Home': moveRow(0); return true;
      case 'End': moveRow(totalOf(voiceOf())); return true;
      case 'Delete': case '.': editPattern('clear note', (ev) => clearAt(ev, ui.row)); return true;
      case 'Backspace': editPattern('delete row', (ev) => deleteRow(ev, ui.row)); return true;
      case 'Insert': editPattern('insert row', (ev) => insertRow(ev, ui.row)); return true;
      case 'Enter': editPattern('set instrument', (ev) => setNoteInstrument(ev, ui.row, s.instrument)); return true;
      case '1': enterRestKey(); return true;
      case 'l': editPattern('toggle legato', (ev) => toggleLegato(ev, ui.row)); return true;
      case '-': changeRunLength(-1); return true;
      case '=': case '+': changeRunLength(1); return true;
      case '9': setSelection({ defaultLength: clamp(s.defaultLength - 1, 1, MAX_LENGTH) }); return true;
      case '0': setSelection({ defaultLength: clamp(s.defaultLength + 1, 1, MAX_LENGTH) }); return true;
      case ';': setSelection({ step: clamp(s.step - 1, 0, 64) }); return true;
      case "'": setSelection({ step: clamp(s.step + 1, 0, 64) }); return true;
      case '[': stepInstrument(-1); return true;
      case ']': stepInstrument(1); return true;
      case 'i': ui.instEntry = ''; render(); return true;
      case '<': case 'F1': setSelection({ octave: clamp(s.octave - 1, 0, 7) }); return true;
      case '>': case 'F2': setSelection({ octave: clamp(s.octave + 1, 0, 7) }); return true;
      default:
    }
    const semitone = e.shiftKey ? -1 : pianoSemitone(e.key.toLowerCase());
    if (semitone >= 0) {
      if (!e.repeat) enterNoteKey(semitone);
      return true;
    }
    return false;
  }

  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (e.ctrlKey || e.metaKey) return;                 // undo, save and friends belong to the app
    let handled = true;

    if (ui.instEntry !== null) {                        // typing an instrument number
      if (/^[0-9a-fA-F]$/.test(e.key)) typeInstrumentDigit(e.key);
      else if (e.key === 'Enter') finishInstrumentEntry(true);
      else finishInstrumentEntry(false);
    } else if (e.altKey) {
      if (e.key === 'ArrowUp') setOrderIndex(ui.shown[voiceOf()] - 1);
      else if (e.key === 'ArrowDown') setOrderIndex(ui.shown[voiceOf()] + 1);
      else handled = false;
    } else if (e.key === 'ArrowLeft') setVoice(voiceOf() - 1);
    else if (e.key === 'ArrowRight') setVoice(voiceOf() + 1);
    else if (e.key === 'Tab') setVoice(voiceOf() + (e.shiftKey ? -1 : 1));
    else if (e.shiftKey && e.key === 'N') actions.newPattern();
    else if (e.shiftKey && e.key === 'D') actions.duplicatePattern();
    else if (e.shiftKey && e.key === 'X') actions.deletePattern();
    else if (e.key === 'o' && ui.zone === 'pattern') { ui.zone = 'order'; render(); }
    else handled = ui.zone === 'order' ? orderKey(e) : patternKey(e);

    if (handled) e.preventDefault();
  }

  // ---- mouse and other widgets -------------------------------------------------------

  function onMouseDown(e) {
    if (e.target.closest('button, input, label')) return;
    const entryEl = e.target.closest('.ed-oe');
    const cellEl = e.target.closest('.ed-c');
    if (entryEl) {
      const v = Number(entryEl.dataset.v);
      selfSelecting = true;
      store.select({ voice: v });
      selfSelecting = false;
      ui.zone = 'order';
      ui.shown[v] = Number(entryEl.dataset.i);
      ui.row = 0;
      syncSelection();
      render();
    } else if (cellEl) {
      const v = Number(cellEl.dataset.v);
      selfSelecting = true;
      store.select({ voice: v });
      selfSelecting = false;
      ui.zone = 'pattern';
      ui.row = clamp(Number(cellEl.parentElement.dataset.r), 0, totalOf(v));
      syncSelection();
      render();
    } else {
      return;
    }
    container.focus();
    e.preventDefault();
  }

  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('mousedown', onMouseDown);
  container.querySelector('.ed-buttons').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    if (!button) return;
    actions[button.dataset.act]();
    container.focus();
  });
  followBox.addEventListener('change', () => { ui.follow = followBox.checked; render(); });
  nameInput.addEventListener('change', () => {
    const n = patternIndexOf(voiceOf());
    if (n >= 0) store.update('rename pattern', (draft) => { draft.song.patterns[n].name = nameInput.value; });
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { nameInput.blur(); container.focus(); }
  });

  let scrollQueued = false;
  scroller.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; renderGrid(); });
  });

  // ---- store changes -----------------------------------------------------------------

  function onPlayhead() {
    const ph = store.playhead;
    const signature = ph && ph.running && ph.voices
      ? ph.voices.map((p) => (p ? `${p.orderIndex}:${p.eventIndex}:${p.ticksLeft}` : '-')).join()
      : 'stopped';
    if (signature === ui.playSignature) return;
    ui.playSignature = signature;
    if (ui.follow && ph && ph.running && ph.voices) {
      const v0 = voiceOf();
      ph.voices.forEach((p, v) => {
        if (p && Number.isInteger(p.orderIndex) && p.orderIndex < song().orders[v].length) ui.shown[v] = p.orderIndex;
      });
      ui.row = clamp(ui.row, 0, totalOf(v0));
    }
    render();
  }

  const unsubscribe = store.subscribe((change) => {
    if (change.kind === 'playhead') onPlayhead();
    else if (change.kind === 'select') {
      if (!selfSelecting) adoptSelection();
      render();
    } else {
      if (change.kind === 'load') { ui.shown = [0, 0, 0]; ui.row = 0; }
      render();
    }
  });

  adoptSelection();
  render();

  return {
    destroy() {
      unsubscribe();
      clearTimeout(ui.messageTimer);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
    },
  };
}
