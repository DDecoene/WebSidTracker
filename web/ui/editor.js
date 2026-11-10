// editor.js - the pattern and order editor. Left: the Patterns panel (every pattern of the
// song). Right: three voices side by side, an order list per voice on top, the pattern of
// the chosen order entry as a grid below.
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
//                    (grid or order list) and which field of the entry, the pattern
//                    picked in the Patterns panel, the "follow the song" switch.
//
// Layout choice: the Patterns panel is a side column (collapsible to a thin strip) and not a
// strip above the grid. The editor pane is only about 55rem wide and 45rem high at every
// window size (the page scales with the rem), and the height is what the grid needs most; a
// pattern list is long and narrow, so it takes a column of 14rem from the width instead, which
// the three voice columns can spare (they each stay about 12.5rem). Folding the panel gives
// the width back.
//
// Only the rows of the grid that can be seen are built, so a pattern with thousands of ticks
// stays fast. Row height is fixed (ROW_H, measured from the stylesheet) for that reason. The
// order lists are small, their rows hold real controls and are kept between renders.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import {
  MAX_LENGTH, MAX_PATTERNS, MAX_PITCH, addPattern, assignPattern, buildLayout, canInsertEntry, clearAt,
  deleteEntry, dropPattern, duplicatePattern, enterNote, enterRest, entryChoice, entryFields, entryInstruments,
  entryKind, entryLabel, eventIndexAtRow, formatTranspose, insertEntry, insertRow, deleteRow, instrumentTitle, keyHelp,
  moveEntry, neighbourField, nextUse, noteLabel, nudgeEntryField, parseHexIndex, parseTranspose,
  patternTitle, patternUsage, patternUsers, pianoSemitone, playRow, removePattern, removeUnusedPatterns,
  rowOfEvent, setEntryChoice, setEntryLoop, setEntryStop, setInstrumentFrom, setNoteInstrument,
  setRunLength, toggleLegato, transposeNote, typeHexDigit, validField, setLoopTarget,
} from './editor-logic.js';
import { createPatternsPanel } from './patterns.js';

export { keyHelp };

// Row and header heights come from the stylesheet (--ed-row-size and --ed-head-size, in rem, so
// they scale with the page). They are measured in pixels at mount and again whenever the
// container resizes (window size, browser zoom), rounded to whole pixels so that every row is
// the same height and the virtual scrolling maths stays exact.
let ROW_H = 20;            // px, the same for every grid row
let HEAD_H = 30;           // px, the sticky header with the voice names
const EXTRA_ROWS = 8;      // empty space after the last row so the end can scroll up
const NARROW_REM = 50;     // an editor narrower than this (in rem) folds the Patterns panel to its strip

const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountEditor(container, store) {
  const ui = {
    zone: 'pattern',               // which part has the keyboard: 'pattern' or 'order'
    field: 'pattern',              // in the order list: which field of the entry ('pattern', 'transpose', 'target')
    row: 0,                        // cursor row in the pattern of the selected voice
    shown: [0, 0, 0],              // order entry shown per voice
    pat: -1,                       // the pattern picked in the Patterns panel
    drag: -1,                      // the pattern being dragged from the panel
    restOfPattern: false,          // the instrument list: also change the notes after this one
    pop: null,                     // the open instrument list: { voice, row, close() }
    follow: true,
    instEntry: null,               // while typing an instrument number: the digits so far
    reveal: false,                 // scroll the cursor into view at the next render
    message: '',
    messageTimer: 0,
    playSignature: '',
    entryKey: '',                  // "voice:entry" of the last cursor placement, to see when it moves
    optionsSignature: null,        // what the pattern drop-downs were built from
    optionsHtml: '',
    instrumentSignature: null,
  };
  let selfSelecting = false;
  const layoutCache = new WeakMap();      // events array -> layout (arrays are never mutated)
  const usageCache = new WeakMap();       // song -> patternUsage
  const incomingCache = new WeakMap();    // song -> entryInstruments

  // ---- the DOM, built once ---------------------------------------------------------

  container.classList.add('ed');
  container.tabIndex = 0;
  container.setAttribute('aria-label', 'Pattern editor');
  container.innerHTML = `
    <div class="ed-bar">
      <span class="ed-status" data-role="status"></span>
      <label class="ed-follow"><input type="checkbox" data-role="follow" checked> Follow</label>
      <div class="ed-instbar">
        <label class="ed-inst" title="The instrument new notes are entered with. The same one is selected in the instrument panel.">Instrument
          <select data-role="instrument"></select></label>
        <button type="button" data-act="instNote" title="Give the note under the cursor this instrument (Enter)">To note</button>
        <button type="button" data-act="instRest" title="Give the note under the cursor and every note after it in this pattern this instrument (Shift+Enter)">To rest of pattern</button>
      </div>
      <span class="ed-msg" role="status" aria-live="polite" data-role="message"></span>
    </div>
    <div class="ed-body">
      <aside class="ed-pats" data-role="pats" aria-label="Patterns"></aside>
      <div class="ed-work">
        <div class="ed-orders" data-role="orders">
          <div class="ed-gutter">order</div>
          <div class="ed-order" data-v="0"></div>
          <div class="ed-order" data-v="1"></div>
          <div class="ed-order" data-v="2"></div>
        </div>
        <div class="ed-grip" data-role="grip" role="separator" aria-orientation="horizontal" tabindex="0"
             aria-label="Order list height (drag, or use the up and down arrow keys)" title="Drag to show more or fewer order rows"></div>
        <div class="ed-scroll" data-role="scroll">
          <div class="ed-head" data-role="head"></div>
          <div class="ed-rows" data-role="rows"></div>
        </div>
      </div>
    </div>`;
  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const statusEl = $('status');
  const followBox = $('follow');
  const instrumentSelect = $('instrument');
  const messageEl = $('message');
  const scroller = $('scroll');
  const headEl = $('head');
  const rowsEl = $('rows');
  const ordersEl = $('orders');
  const orderEls = [...container.querySelectorAll('.ed-order')];
  const gripEl = $('grip');

  const panel = createPatternsPanel($('pats'), {
    select(n) { ui.pat = n; render(); },
    use: (n) => usePattern(n),
    insert: (n) => insertPatternEntry(n),
    create: () => createPattern(),
    duplicate: (n) => copyPattern(n),
    remove: (n) => removeOne(n),
    removeUnused: () => removeAllUnused(),
    rename: (n, name) => store.update('rename pattern', (draft) => { if (draft.song.patterns[n]) draft.song.patterns[n].name = name; }),
    jump: (n, voice) => jumpToUse(n, voice),
    drag(n) { ui.drag = n; if (n < 0) clearDropMarks(); },
    leave: () => container.focus(),
    say: (text) => say(text),
  });

  // ---- sizes from the stylesheet -------------------------------------------------------

  // Measure what a length such as 1.45rem is in pixels right now, using a probe element.
  function measure(cssLength) {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${cssLength}`;
    container.append(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  }

  // Returns true when the sizes changed.
  function measureSizes() {
    const row = Math.max(8, Math.round(measure('var(--ed-row-size)')));
    const head = Math.max(8, Math.round(measure('var(--ed-head-size)')));
    if (row === ROW_H && head === HEAD_H && container.style.getPropertyValue('--ed-row-h')) return false;
    ROW_H = row;
    HEAD_H = head;
    container.style.setProperty('--ed-row-h', `${row}px`);
    container.style.setProperty('--ed-head-h', `${head}px`);
    return true;
  }
  measureSizes();

  // ---- the order list height grip ------------------------------------------------------

  let orderRows = null;                       // null = the stylesheet's default for this window height
  function setOrderRows(rows) {
    orderRows = clamp(rows, 3, 30);
    container.style.setProperty('--ed-order-rows', String(orderRows));
  }
  gripEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gripEl.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startRows = orderRows ?? Number.parseFloat(getComputedStyle(container).getPropertyValue('--ed-order-rows'));
    const move = (ev) => setOrderRows(Math.round((startRows + (ev.clientY - startY) / ROW_H) * 2) / 2);
    const up = () => {
      gripEl.removeEventListener('pointermove', move);
      gripEl.removeEventListener('pointerup', up);
      gripEl.removeEventListener('pointercancel', up);
    };
    gripEl.addEventListener('pointermove', move);
    gripEl.addEventListener('pointerup', up);
    gripEl.addEventListener('pointercancel', up);
  });
  gripEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const now = orderRows ?? Number.parseFloat(getComputedStyle(container).getPropertyValue('--ed-order-rows'));
    setOrderRows(now + (e.key === 'ArrowDown' ? 1 : -1));
  });

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

  function memo(cache, compute) {
    const key = song();
    let value = cache.get(key);
    if (!value) {
      value = compute(key);
      cache.set(key, value);
    }
    return value;
  }
  const usageOf = () => memo(usageCache, patternUsage);
  const incomingOf = () => memo(incomingCache, entryInstruments);

  // Keep every index inside what exists (after undo, load, deleting things...).
  function normalise() {
    for (let v = 0; v < 3; v++) ui.shown[v] = clamp(ui.shown[v], 0, Math.max(0, song().orders[v].length - 1));
    ui.row = clamp(ui.row, 0, totalOf(voiceOf()));
    if (ui.pat >= song().patterns.length) ui.pat = -1;
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
    // When the cursor arrives at another order entry, the Patterns panel picks that entry's pattern.
    const key = `${v}:${ui.shown[v]}`;
    if (key !== ui.entryKey) {
      ui.entryKey = key;
      const n = patternIndexOf(v);
      if (n >= 0) ui.pat = n;
    }
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
    const key = `${v}:${ui.shown[v]}`;
    if (key !== ui.entryKey) {
      ui.entryKey = key;
      const n = patternIndexOf(v);
      if (n >= 0) ui.pat = n;
    }
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
    const patNo = patternIndexOf(v);
    const where = ui.zone === 'order' ? 'order list' : 'pattern';
    const typing = ui.instEntry !== null ? `   instrument: ${ui.instEntry.padEnd(2, '_')}` : '';
    statusEl.textContent =
      `Voice ${v + 1} ${where}  entry ${hex2(ui.shown[v])}  pattern ${patNo >= 0 ? hex2(patNo) : '--'}  row ${hex2(ui.row)}` +
      `  |  octave ${s.octave}  length ${s.defaultLength}  step ${s.step}${typing}`;
    followBox.checked = ui.follow;

    // The current-instrument drop-down: the same list as the instrument panel, kept in step with it.
    const list = store.project.instruments;
    const signature = JSON.stringify([list.map((inst) => (inst ? inst.name : null)), s.instrument]);
    if (signature !== ui.instrumentSignature) {
      ui.instrumentSignature = signature;
      let html = '';
      list.forEach((inst, n) => { if (inst || n === s.instrument) html += `<option value="${n}">${escapeHtml(instrumentTitle(n, inst))}</option>`; });
      if (!list[s.instrument] && s.instrument >= list.length) html += `<option value="${s.instrument}">${escapeHtml(instrumentTitle(s.instrument, null))}</option>`;
      instrumentSelect.innerHTML = html;
      instrumentSelect.value = String(s.instrument);
    }
  }

  // ---- order lists: a row per entry, with real controls -----------------------------------

  const orderRowsOf = [[], [], []];            // the row elements of each voice

  function createOrderRow(v) {
    const row = document.createElement('div');
    row.className = 'ed-oe';
    row.dataset.v = String(v);
    row.innerHTML = `
      <div class="oe-main">
        <span class="ix"></span>
        <select class="oe-pat" data-f="pattern" title="Pattern of this entry (or STOP / LOOP). Up and Down change it when the keyboard is on the order list."></select>
        <span class="oe-tr">
          <button type="button" class="oe-b" data-op="t-1" title="Transpose one semitone down">&minus;</button>
          <input class="oe-num" data-f="transpose" type="text" size="3" maxlength="4" inputmode="numeric" spellcheck="false" autocomplete="off"
                 title="Transpose in semitones. Type a number, or use Up and Down (Shift = an octave).">
          <button type="button" class="oe-b" data-op="t+1" title="Transpose one semitone up">+</button>
        </span>
        <span class="oe-lp">&rarr;<input class="oe-hex" data-f="target" type="text" size="2" maxlength="2" spellcheck="false" autocomplete="off"
                 title="The entry the voice jumps back to (hex)"></span>
      </div>
      <div class="oe-tools">
        <button type="button" class="oe-b oe-oct" data-op="t-12" title="Octave down: transpose 12 semitones lower">-12</button>
        <button type="button" class="oe-b oe-oct" data-op="t+12" title="Octave up: transpose 12 semitones higher">+12</button>
        <span class="oe-gap"></span>
        <button type="button" class="oe-b" data-op="insert" title="Insert a new entry after this one">ins</button>
        <button type="button" class="oe-b" data-op="delete" title="Delete this entry">del</button>
        <button type="button" class="oe-b" data-op="up" title="Move this entry up (Alt+Shift+Up)">&uarr;</button>
        <button type="button" class="oe-b" data-op="down" title="Move this entry down (Alt+Shift+Down)">&darr;</button>
      </div>`;
    row._ix = row.querySelector('.ix');
    row._pat = row.querySelector('.oe-pat');
    row._num = row.querySelector('.oe-num');
    row._hex = row.querySelector('.oe-hex');
    row._state = '';
    row._options = null;
    return row;
  }

  // The options of every pattern drop-down: "NN name" for each pattern, then STOP and LOOP.
  function patternOptionsHtml() {
    const patterns = song().patterns;
    const signature = patterns.map((p) => p.name || '').join('\u0001');
    if (signature !== ui.optionsSignature) {
      ui.optionsSignature = signature;
      let html = '';
      patterns.forEach((p, n) => { html += `<option value="${n}">${escapeHtml(patternTitle(n, p.name))}</option>`; });
      html += '<option value="stop">STOP</option><option value="loop">LOOP</option>';
      ui.optionsHtml = html;
    }
    return ui.optionsHtml;
  }

  function updateOrderRow(row, v, i, entry, context) {
    const kind = entryKind(entry);
    const here = i === ui.shown[v];
    const selected = here && v === context.voice;
    const keyboard = selected && ui.zone === 'order';
    const field = validField(entry, ui.field);
    const playing = context.playing[v] === i;
    const uses = kind === 'pattern' && entry.pattern === ui.pat;
    const dangling = kind === 'pattern' && !song().patterns[entry.pattern];
    const state = JSON.stringify([i, kind, entryChoice(entry), entry.transpose, entry.loop, here, selected, keyboard, field, playing, uses,
      dangling, ui.optionsSignature]);
    if (row._state === state) return;
    row._state = state;

    const classes = ['ed-oe', `k-${kind}`];
    if (here) classes.push('cur');
    if (selected) classes.push(keyboard ? 'sel' : 'seldim');
    if (playing) classes.push('play');
    if (uses) classes.push('uses');
    if (dangling) classes.push('dangling');
    if (keyboard) classes.push(`f-${field}`);
    row.className = classes.join(' ');
    row.dataset.i = String(i);
    row._ix.textContent = hex2(i);
    row._pat.setAttribute('aria-label', `Pattern of entry ${hex2(i)}, voice ${v + 1}`);
    if (row._options !== context.options) {
      row._options = context.options;
      row._pat.innerHTML = context.options;
    }
    row._pat.value = String(entryChoice(entry));
    if (dangling) row._pat.selectedIndex = -1;
    row._num.setAttribute('aria-label', `Transpose of entry ${hex2(i)}, voice ${v + 1}, in semitones`);
    row._hex.setAttribute('aria-label', `Loop target of entry ${hex2(i)}, voice ${v + 1}`);
    if (document.activeElement !== row._num) row._num.value = kind === 'pattern' ? formatTranspose(entry.transpose || 0) : '';
    if (document.activeElement !== row._hex) row._hex.value = kind === 'loop' ? hex2(entry.loop) : '';
  }

  function renderOrders() {
    const ph = store.playhead;
    const running = Boolean(ph && ph.running && ph.voices);
    const context = {
      voice: voiceOf(),
      playing: [0, 1, 2].map((v) => (running && ph.voices[v] ? ph.voices[v].orderIndex : -1)),
      options: patternOptionsHtml(),
    };
    orderEls.forEach((el, v) => {
      const list = song().orders[v];
      let header = el.querySelector('.ed-oh');
      let empty = el.querySelector('.ed-empty');
      if (!header) {
        header = document.createElement('div');
        header.className = 'ed-oh';
        header.textContent = `Voice ${v + 1}`;
        empty = document.createElement('div');
        empty.className = 'ed-empty';
        empty.innerHTML = '(no entries) <button type="button" class="oe-b" data-op="add" title="Add the first entry of this voice">+ add entry</button>';
        el.append(header, empty);
      }
      empty.hidden = list.length > 0;
      const rows = orderRowsOf[v];
      while (rows.length < list.length) {
        const row = createOrderRow(v);
        rows.push(row);
        el.insertBefore(row, empty);
      }
      while (rows.length > list.length) rows.pop().remove();
      list.forEach((entry, i) => updateOrderRow(rows[i], v, i, entry, context));
      const cur = rows[ui.shown[v]];
      if (cur) {                                   // keep the shown entry inside the little list
        const top = cur.offsetTop - header.offsetHeight;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (cur.offsetTop + cur.offsetHeight > el.scrollTop + el.clientHeight) {
          el.scrollTop = cur.offsetTop + cur.offsetHeight - el.clientHeight;
        }
      }
    });
  }

  function renderPanel() {
    const ph = store.playhead;
    const running = Boolean(ph && ph.running && ph.voices);
    const v = voiceOf();
    panel.render({
      usage: usageOf(),
      selected: ui.pat,
      here: patternIndexOf(v),
      playing: [0, 1, 2].map((voice) => {
        const p = running ? ph.voices[voice] : null;
        return p && Number.isInteger(p.patternIndex) ? p.patternIndex : -1;
      }),
      entry: song().orders[v].length ? `voice ${v + 1} entry ${hex2(ui.shown[v])}` : `voice ${v + 1}`,
    });
  }

  // One cell of the grid. The instrument of a note is a chip you can click; it is dimmed when
  // the note has no instrument event of its own and just keeps the one before it.
  function cellHtml(r, incoming) {
    if (!r) return '';
    const legato = (flag) => `<span class="lg">${flag ? 'L' : ' '}</span>`;
    const mark = (inst) => `<span class="in">${inst !== null && inst !== undefined ? hex2(inst) : '  '}</span>`;
    switch (r.kind) {
      case 'note': return `<span class="nt">${noteLabel(r.pitch)}</span> ${chipHtml(r, incoming)} ${legato(r.legato)}`;
      case 'rest': return `<span class="rs">---</span> ${mark(r.inst)} ${legato(r.legato)}`;
      case 'sustain': return `<span class="su ${r.of}"> ${r.of === 'note' ? '|' : '·'} </span>`;
      default: return `<span class="en">end</span> ${mark(r.inst)} ${legato(r.legato)}`;
    }
  }

  function chipHtml(r, incoming) {
    const explicit = r.inst !== null && r.inst !== undefined;
    const n = r.eff !== null && r.eff !== undefined ? r.eff : incoming;
    const inst = store.project.instruments[n];
    const name = inst ? inst.name || '' : '?';
    const why = explicit ? 'set here' : r.eff !== null ? 'kept from the note before' : 'carried over from the pattern before';
    const title = `Instrument ${instrumentTitle(n, inst)} (${why}). Click to change it for this note.`;
    return `<span class="chip${explicit ? '' : ' inh'}${inst ? '' : ' bad'}" title="${escapeHtml(title)}"><b>${hex2(n)}</b> ${escapeHtml(name)}</span>`;
  }

  function renderGrid() {
    const v0 = voiceOf();
    const layouts = [0, 1, 2].map(layoutOf);
    const incoming = incomingOf();
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
        : `<i>${entryKind(entryOf(v)) === 'none' ? 'no entry' : escapeHtml(entryLabel(entryOf(v)))}</i>`;
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
        html += `<div class="${classes.join(' ')}" data-v="${v}">${layout ? cellHtml(layout.rows[r], incoming[v][ui.shown[v]] ?? 0) : ''}</div>`;
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
    renderPanel();
  }

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

  // Put the cursor on an order entry of any voice: that voice and entry become the selected ones
  // everywhere (the grid shows its pattern, the Patterns panel picks it, the other panels follow
  // store.selection).
  function focusEntry(v, i, { zone, field } = {}) {
    selfSelecting = true;
    store.select({ voice: v });
    selfSelecting = false;
    ui.shown[v] = clamp(i, 0, Math.max(0, song().orders[v].length - 1));
    if (zone) ui.zone = zone;
    if (field) ui.field = validField(entryOf(v), field);
    ui.row = 0;
    ui.reveal = true;
    syncSelection();
    render();
    panel.scrollToSelected();
  }

  const setOrderIndex = (i) => focusEntry(voiceOf(), i);

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

  function editSong(label, edit, options) {
    store.update(label, (draft) => edit(draft.song), options);
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

  // ---- the instrument of a note ----------------------------------------------------------------

  // Give the note at `row` of pattern n another instrument; with `rest` also all later notes of
  // the pattern. The pattern is named by number, not "the one on screen", because the list that
  // calls this can stay open while the song plays and the grid follows it.
  function setNoteInstrumentAt(v, n, row, instrument, rest) {
    const pattern = song().patterns[n];
    if (!pattern) return false;
    const events = (rest ? setInstrumentFrom : setNoteInstrument)(pattern.events, row, instrument);
    if (!events) return false;
    store.update('set instrument', (draft) => { draft.song.patterns[n].events = events; });
    if (v === voiceOf() && patternIndexOf(v) === n) {
      ui.row = clamp(row, 0, totalOf(v));
      syncSelection();
    }
    render();
    return true;
  }

  function closeInstrumentList() {
    if (!ui.pop) return;
    const { close } = ui.pop;
    ui.pop = null;
    close();
  }

  // The list that opens when you click the instrument chip of a note.
  function openInstrumentList(chip, row) {
    closeInstrumentList();
    const v = voiceOf();
    const layout = layoutOf(v);
    const r = layout && layout.rows[row];
    if (!r || r.kind !== 'note') { say('Put the cursor on a note to change its instrument.'); return; }
    const incoming = incomingOf()[v][ui.shown[v]] ?? 0;
    const inForce = r.eff !== null ? r.eff : incoming;
    const patternNo = patternIndexOf(v);
    const entry = entryOf(v);
    const transpose = entryKind(entry) === 'pattern' ? entry.transpose || 0 : 0;
    const list = store.project.instruments;
    const pop = document.createElement('div');
    pop.className = 'ed-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Instrument for the note at row ${hex2(row)}`);
    let html = `<div class="pop-head">Instrument for ${noteLabel(r.pitch)} at row ${hex2(row)}</div><div class="pop-list" role="listbox">`;
    list.forEach((inst, n) => {
      if (!inst) return;
      html += `<button type="button" role="option" class="pop-opt${n === inForce ? ' current' : ''}" data-n="${n}" aria-selected="${n === inForce}">` +
        `<b>${hex2(n)}</b> ${escapeHtml(inst.name || '(unnamed)')}${n === inForce ? '<i>now</i>' : ''}</button>`;
    });
    html += `</div><label class="pop-rest"><input type="checkbox" ${ui.restOfPattern ? 'checked' : ''}> also the rest of the pattern</label>`;
    pop.innerHTML = html;
    container.append(pop);

    const rect = chip.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    const left = clamp(rect.left, 4, Math.max(4, window.innerWidth - box.width - 4));
    const below = rect.bottom + 2;
    const top = below + box.height > window.innerHeight - 4 ? Math.max(4, rect.top - box.height - 2) : below;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    const outside = (event) => { if (!pop.contains(event.target)) closeInstrumentList(); };
    const options = () => [...pop.querySelectorAll('.pop-opt')];
    pop.addEventListener('click', (event) => {
      const option = event.target.closest('.pop-opt');
      if (!option) return;
      const n = Number(option.dataset.n);
      closeInstrumentList();
      container.focus();
      if (setNoteInstrumentAt(v, patternNo, row, n, ui.restOfPattern) && store.auditionNote) {
        store.auditionNote(n, clamp(r.pitch + transpose, 0, MAX_PITCH));
      }
    });
    pop.querySelector('input').addEventListener('change', (event) => { ui.restOfPattern = event.target.checked; });
    pop.addEventListener('keydown', (event) => {
      const all = options();
      const at = all.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); closeInstrumentList(); container.focus(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); all[Math.min(all.length - 1, at + 1)].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); all[Math.max(0, at - 1)].focus(); }
      else if (event.key === 'Home') { event.preventDefault(); all[0].focus(); }
      else if (event.key === 'End') { event.preventDefault(); all[all.length - 1].focus(); }
      event.stopPropagation();
    });
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    ui.pop = { voice: v, row, close() { document.removeEventListener('mousedown', outside, true); pop.remove(); } };
    const current = pop.querySelector('.pop-opt.current') || pop.querySelector('.pop-opt');
    if (current) { current.focus(); current.scrollIntoView({ block: 'nearest' }); }
  }

  // ---- pattern actions (the Patterns panel, the keys) ------------------------------------------

  function afterPatternChange() {
    normalise();
    ui.reveal = true;
    syncSelection();
    render();
  }

  const patternLimit = () => {
    if (song().patterns.length < MAX_PATTERNS) return false;
    say(`A song can have at most ${MAX_PATTERNS} patterns.`);
    return true;
  };

  // The panel's New and Duplicate only make a pattern and pick it; nothing else changes, so the
  // numbers stay as they are. The keys (Shift+N, Shift+D) also put it in the current entry.
  function createPattern() {
    if (patternLimit()) return;
    let n = -1;
    store.update('new pattern', (draft) => { n = addPattern(draft.song); });
    ui.pat = n;
    say(`Pattern ${hex2(n)} made. It is not used yet: pick an order entry and press Use in entry.`);
    render();
    panel.scrollToSelected();
  }

  function copyPattern(n) {
    if (!song().patterns[n]) return;
    if (patternLimit()) return;
    let copy = -1;
    store.update('duplicate pattern', (draft) => { copy = duplicatePattern(draft.song, n); });
    ui.pat = copy;
    say(`Pattern ${hex2(n)} copied to ${hex2(copy)}. It is not used yet.`);
    render();
    panel.scrollToSelected();
  }

  // Put pattern n in the current order entry (the entry keeps its transpose).
  function usePattern(n) {
    if (!song().patterns[n]) return;
    const v = voiceOf();
    let at = ui.shown[v];
    store.update('use pattern', (draft) => { at = assignPattern(draft.song, v, ui.shown[v], n); });
    ui.shown[v] = at;
    ui.pat = n;
    ui.row = 0;
    say(`Pattern ${hex2(n)} is now in voice ${v + 1} entry ${hex2(at)}.`);
    afterPatternChange();
  }

  // Insert a new order entry for pattern n after the current one.
  function insertPatternEntry(n) {
    if (!song().patterns[n]) return;
    const v = voiceOf();
    if (!canInsertEntry(song().orders[v])) { say(`Voice ${v + 1} has no room for another order entry.`); return; }
    const at = song().orders[v].length ? ui.shown[v] + 1 : 0;
    store.update('insert order entry', (draft) => insertEntry(draft.song, v, at, { pattern: n, transpose: 0 }));
    ui.shown[v] = at;
    ui.pat = n;
    ui.row = 0;
    say(`New entry ${hex2(at)} in voice ${v + 1} plays pattern ${hex2(n)}.`);
    afterPatternChange();
    panel.scrollToSelected();
  }

  function jumpToUse(n, voice) {
    const use = nextUse(song(), n, voice, voice === voiceOf() ? ui.shown[voice] : -1);
    if (use) focusEntry(voice, use.index, { zone: 'order' });
  }

  function removeOne(n) {
    const record = usageOf()[n];
    if (!record) return;
    if (!record.unused) { say(`Pattern ${hex2(n)} is used. Change those order entries first.`); return; }
    store.update('delete pattern', (draft) => removePattern(draft.song, n));
    ui.pat = Math.min(n, song().patterns.length - 1);
    say(`Deleted pattern ${hex2(n)}.`);
    afterPatternChange();
  }

  function removeAllUnused() {
    let removed = [];
    store.update('delete unused patterns', (draft) => { removed = removeUnusedPatterns(draft.song); });
    if (!removed.length) { say('Every pattern is used.'); return; }
    ui.pat = patternIndexOf(voiceOf());
    say(`Deleted ${removed.length} unused pattern${removed.length === 1 ? '' : 's'}. The later patterns were renumbered; Undo brings them back.`);
    afterPatternChange();
  }

  // The keys on the grid: a new pattern or a copy goes into the current order entry.
  const actions = {
    newPattern() {
      if (patternLimit()) return;
      const v = voiceOf();
      let at = 0;
      let n = -1;
      store.update('new pattern', (draft) => {
        n = addPattern(draft.song);
        at = assignPattern(draft.song, v, ui.shown[v], n);
      });
      ui.shown[v] = at;
      ui.pat = n;
      ui.row = 0;
      afterPatternChange();
    },

    duplicatePattern() {
      const v = voiceOf();
      const n = patternIndexOf(v);
      if (n < 0) { say('There is no pattern to duplicate here.'); return; }
      if (patternLimit()) return;
      let at = 0;
      let copy = -1;
      store.update('duplicate pattern', (draft) => {
        copy = duplicatePattern(draft.song, n);
        at = assignPattern(draft.song, v, ui.shown[v], copy);
      });
      ui.shown[v] = at;
      ui.pat = copy;
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
      ui.pat = -1;
      say(`Deleted pattern ${hex2(n)} and its order entry.`);
      afterPatternChange();
    },
  };

  // ---- order entry actions (the row buttons, the keys) -----------------------------------------

  // A new entry after entry i; it starts as a copy of that entry (same pattern and transpose).
  function insertEntryAfter(v, i) {
    const list = song().orders[v];
    if (!song().patterns.length) { say('Make a pattern first (the New button in the Patterns panel).'); return; }
    if (!canInsertEntry(list)) { say(`Voice ${v + 1} has no room for another order entry.`); return; }
    const current = list[i];
    const template = entryKind(current) === 'pattern'
      ? { pattern: current.pattern, transpose: current.transpose }
      : { pattern: 0, transpose: 0 };
    const at = list.length ? i + 1 : 0;
    store.update('insert order entry', (draft) => insertEntry(draft.song, v, at, template));
    focusEntry(v, at, { zone: 'order' });
  }

  function deleteEntryAt(v, i) {
    if (!song().orders[v].length) return;
    store.update('delete order entry', (draft) => deleteEntry(draft.song, v, i));
    focusEntry(v, Math.min(i, song().orders[v].length - 1), { zone: 'order' });
  }

  function moveEntryBy(v, i, delta) {
    const to = i + delta;
    if (to < 0 || to >= song().orders[v].length) return;
    store.update('move order entry', (draft) => moveEntry(draft.song, v, i, to));
    focusEntry(v, to, { zone: 'order' });
  }

  // Change one field of an entry by `delta` (see nudgeEntryField). With `merge` (the arrow keys,
  // which repeat) steps on the same field in quick succession are one undo step; a button click
  // is always a step of its own.
  function nudgeField(v, i, field, delta, merge = false) {
    const entry = song().orders[v][i];
    if (!entry) return;
    const before = JSON.stringify(entry);
    editSong(`change ${field}`, (s) => nudgeEntryField(s, v, i, field, delta), merge ? { merge: `nudge:${v}:${i}:${field}` } : undefined);
    if (JSON.stringify(song().orders[v][i]) === before) {
      if (field === 'pattern' && entryKind(entry) !== 'pattern') say('This entry is not a pattern. Pick a pattern in its drop-down (or press p).');
      return;
    }
    if (field === 'pattern') {
      ui.row = clamp(ui.row, 0, totalOf(voiceOf()));
      const n = patternIndexOf(v);
      if (n >= 0 && i === ui.shown[v]) ui.pat = n;
    }
    afterPatternChange();
  }

  function setTransposeText(v, i, text) {
    const value = parseTranspose(text);
    const entry = song().orders[v][i];
    if (value !== null && entryKind(entry) === 'pattern') editSong('set transpose', (s) => { s.orders[v][i].transpose = value; }, { merge: `nudge:${v}:${i}:transpose` });
    afterPatternChange();
  }

  function setTargetText(v, i, text) {
    const value = parseHexIndex(text);
    if (value !== null) editSong('set loop target', (s) => setLoopTarget(s, v, i, value));
    afterPatternChange();
  }

  function chooseEntry(v, i, value) {
    const choice = value === 'stop' || value === 'loop' ? value : Number(value);
    editSong('set order entry', (s) => setEntryChoice(s, v, i, choice));
    if (typeof choice === 'number') ui.pat = choice;
    ui.row = clamp(ui.row, 0, totalOf(voiceOf()));
    afterPatternChange();
  }

  // Keys on the order list. The arrow keys work on the fields of the selected entry:
  // Left / Right pick a field, Up / Down change it.
  function orderKey(e) {
    const v = voiceOf();
    const at = ui.shown[v];
    const entry = entryOf(v);
    const kind = entryKind(entry);
    const patternCount = song().patterns.length;
    const field = validField(entry, ui.field);
    const valueField = kind === 'loop' ? 'target' : 'pattern';

    const setPattern = (n) => {
      if (kind !== 'pattern' || n < 0 || n >= patternCount) return;
      chooseEntry(v, at, String(n));
    };

    switch (e.key) {
      case 'ArrowUp': case 'ArrowDown': {
        const sign = e.key === 'ArrowUp' ? 1 : -1;
        nudgeField(v, at, field, sign * (field === 'transpose' && e.shiftKey ? 12 : 1), true);
        return true;
      }
      case 'PageUp': setOrderIndex(at - 1); return true;
      case 'PageDown': setOrderIndex(at + 1); return true;
      case 'Home': setOrderIndex(0); return true;
      case 'End': setOrderIndex(song().orders[v].length - 1); return true;
      case '+': case '=': nudgeField(v, at, valueField, 1, true); return true;
      case '-': case '_': nudgeField(v, at, valueField, -1, true); return true;
      case '[': nudgeField(v, at, 'transpose', -1, true); return true;
      case ']': nudgeField(v, at, 'transpose', 1, true); return true;
      case '{': nudgeField(v, at, 'transpose', -12, true); return true;
      case '}': nudgeField(v, at, 'transpose', 12, true); return true;
      case 'Insert': insertEntryAfter(v, at); return true;
      case 'Delete': case 'Backspace': deleteEntryAt(v, at); return true;
      case 's': editSong('stop entry', (s) => setEntryStop(s, v, at)); afterPatternChange(); return true;
      case 'l': editSong('loop entry', (s) => setEntryLoop(s, v, at, 0)); afterPatternChange(); return true;
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
      if (kind === 'pattern' && field === 'pattern') {
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

  // Left / Right in the order list: the next field of this entry, and past the last one the
  // neighbouring voice, so the old "Left / Right switch voice" still gets you there.
  function orderField(direction) {
    const v = voiceOf();
    const step = neighbourField(entryOf(v), ui.field, direction);
    if (step.field) {
      ui.field = step.field;
      render();
      return;
    }
    const next = (v + direction + 3) % 3;
    const fields = entryFields(song().orders[next][ui.shown[next]]);
    focusEntry(next, ui.shown[next], { zone: 'order', field: direction > 0 ? fields[0] : fields[fields.length - 1] });
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
      case 'Enter':
        editPattern('set instrument', (ev) => (e.shiftKey ? setInstrumentFrom(ev, ui.row, s.instrument) : setNoteInstrument(ev, ui.row, s.instrument)));
        return true;
      case 'I': {
        const chip = rowsEl.querySelector(`.ed-row[data-r="${ui.row}"] .ed-c[data-v="${voiceOf()}"] .chip`);
        if (chip) openInstrumentList(chip, ui.row); else say('Put the cursor on a note to change its instrument.');
        return true;
      }
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
    if (e.target.closest('.ed-pats, .ed-pop')) return;   // those have their own keys
    if (e.ctrlKey || e.metaKey) return;                 // undo, save and friends belong to the app
    let handled = true;

    if (ui.instEntry !== null) {                        // typing an instrument number
      if (/^[0-9a-fA-F]$/.test(e.key)) typeInstrumentDigit(e.key);
      else if (e.key === 'Enter') finishInstrumentEntry(true);
      else finishInstrumentEntry(false);
    } else if (e.altKey) {
      const v = voiceOf();
      if (e.key === 'ArrowUp' && e.shiftKey) moveEntryBy(v, ui.shown[v], -1);
      else if (e.key === 'ArrowDown' && e.shiftKey) moveEntryBy(v, ui.shown[v], 1);
      else if (e.key === 'ArrowUp') setOrderIndex(ui.shown[v] - 1);
      else if (e.key === 'ArrowDown') setOrderIndex(ui.shown[v] + 1);
      else handled = false;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      if (ui.zone === 'order') orderField(direction); else setVoice(voiceOf() + direction);
    } else if (e.key === 'Tab') setVoice(voiceOf() + (e.shiftKey ? -1 : 1));
    else if (e.shiftKey && e.key === 'N') actions.newPattern();
    else if (e.shiftKey && e.key === 'D') actions.duplicatePattern();
    else if (e.shiftKey && e.key === 'X') actions.deletePattern();
    else if (e.shiftKey && e.key === 'P') { panel.expand(); panel.focus(); }
    else if (e.key === 'o' && ui.zone === 'pattern') { ui.zone = 'order'; render(); }
    else handled = ui.zone === 'order' ? orderKey(e) : patternKey(e);

    if (handled) e.preventDefault();
  }

  // ---- mouse and other widgets -------------------------------------------------------

  // A click in the grid puts the cursor there; a click on an instrument chip also opens the list.
  function onMouseDown(e) {
    if (e.target.closest('button, input, label, select, .ed-pop')) return;
    const cellEl = e.target.closest('.ed-c');
    if (!cellEl) return;
    const v = Number(cellEl.dataset.v);
    const chip = e.target.closest('.chip');
    const rect = chip ? chip.getBoundingClientRect() : null;
    selfSelecting = true;
    store.select({ voice: v });
    selfSelecting = false;
    ui.zone = 'pattern';
    ui.row = clamp(Number(cellEl.parentElement.dataset.r), 0, totalOf(v));
    syncSelection();
    render();
    container.focus();
    e.preventDefault();
    if (chip) openInstrumentList({ getBoundingClientRect: () => rect }, ui.row);
  }

  // The order lists: a click on an entry selects that voice and entry. Clicks on the buttons and
  // the drop-down are left alone until they are done (the selected entry grows a second line of
  // buttons, which would move the row away from under the pointer in the middle of the click);
  // then the entry is selected. A click on the number boxes selects the entry as the box gets
  // the focus (see below); elsewhere on the entry it takes the keyboard.
  ordersEl.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.ed-oe');
    if (!row || e.target.closest('select, input, button')) return;
    focusEntry(Number(row.dataset.v), Number(row.dataset.i), { zone: 'order' });
    container.focus();
    e.preventDefault();
  });

  ordersEl.addEventListener('focusin', (e) => {
    const row = e.target.closest('.ed-oe');
    if (!row || !e.target.matches('input')) return;
    e.target._before = e.target.value;
    const v = Number(row.dataset.v);
    const i = Number(row.dataset.i);
    if (v !== voiceOf() || i !== ui.shown[v] || ui.zone !== 'order') focusEntry(v, i, { zone: 'order', field: e.target.dataset.f });
  });

  ordersEl.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-op]');
    if (!button) return;
    const row = button.closest('.ed-oe');
    if (!row) {                                          // the "add entry" button of an empty list
      const column = button.closest('.ed-order');
      insertEntryAfter(Number(column.dataset.v), 0);
      container.focus();
      return;
    }
    const v = Number(row.dataset.v);
    const i = Number(row.dataset.i);
    const select = () => focusEntry(v, i, { zone: 'order', field: 'transpose' });
    switch (button.dataset.op) {
      case 't-1': nudgeField(v, i, 'transpose', -1); select(); break;
      case 't+1': nudgeField(v, i, 'transpose', 1); select(); break;
      case 't-12': nudgeField(v, i, 'transpose', -12); select(); break;
      case 't+12': nudgeField(v, i, 'transpose', 12); select(); break;
      case 'insert': insertEntryAfter(v, i); break;
      case 'delete': deleteEntryAt(v, i); break;
      case 'up': moveEntryBy(v, i, -1); break;
      case 'down': moveEntryBy(v, i, 1); break;
      default:
    }
    container.focus();
  });

  ordersEl.addEventListener('change', (e) => {
    const row = e.target.closest('.ed-oe');
    if (!row) return;
    const v = Number(row.dataset.v);
    const i = Number(row.dataset.i);
    if (e.target.matches('.oe-pat')) { chooseEntry(v, i, e.target.value); focusEntry(v, i, { zone: 'order', field: 'pattern' }); container.focus(); }
    else if (e.target.matches('.oe-num')) setTransposeText(v, i, e.target.value);
    else if (e.target.matches('.oe-hex')) setTargetText(v, i, e.target.value);
  });

  // Once a box has been left, show its value in the usual form again ("7" becomes "+7", bad text goes).
  ordersEl.addEventListener('focusout', (e) => {
    const row = e.target.closest('.ed-oe');
    if (!row || !e.target.matches('.oe-num, .oe-hex')) return;
    setTimeout(() => { row._state = ''; render(); }, 0);
  });

  ordersEl.addEventListener('keydown', (e) => {
    const row = e.target.closest('.ed-oe');
    if (!row || !e.target.matches('.oe-num, .oe-hex')) return;
    const v = Number(row.dataset.v);
    const i = Number(row.dataset.i);
    if (e.key === 'Enter') {
      e.preventDefault();
      container.focus();                              // leaving the box commits it (the change event)
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.target.value = e.target._before;              // put back what it showed: nothing to commit
      container.focus();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.matches('.oe-num')) {
      e.preventDefault();
      nudgeField(v, i, 'transpose', (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), true);
      const entry = song().orders[v][i];                // the box has the focus, so render() leaves it alone: set it here
      e.target.value = formatTranspose(entry && entry.transpose ? entry.transpose : 0);
      e.target._before = e.target.value;
    }
  });

  // ---- dragging a pattern from the Patterns panel onto the order lists ----------------------------

  function clearDropMarks() {
    for (const el of ordersEl.querySelectorAll('.drop-on, .drop-before, .drop-after, .drop-end')) {
      el.classList.remove('drop-on', 'drop-before', 'drop-after', 'drop-end');
    }
  }

  // Where a drag is: on an entry (replace its pattern), in the top or bottom quarter of an entry
  // (insert before / after it), or in the free space under the entries (append).
  function dropTarget(e) {
    const column = e.target.closest('.ed-order');
    if (!column) return null;
    const v = Number(column.dataset.v);
    const row = e.target.closest('.ed-oe');
    if (!row) return { v, i: song().orders[v].length - 1, zone: 'end', el: column };
    const box = row.querySelector('.oe-main').getBoundingClientRect();
    const fraction = (e.clientY - box.top) / box.height;
    return { v, i: Number(row.dataset.i), zone: fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'on', el: row };
  }

  ordersEl.addEventListener('dragover', (e) => {
    if (ui.drag < 0) return;
    const target = dropTarget(e);
    if (!target) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    clearDropMarks();
    target.el.classList.add(`drop-${target.zone}`);
  });
  ordersEl.addEventListener('dragleave', (e) => {
    if (!ordersEl.contains(e.relatedTarget)) clearDropMarks();
  });
  ordersEl.addEventListener('drop', (e) => {
    if (ui.drag < 0) return;
    const target = dropTarget(e);
    clearDropMarks();
    if (!target) return;
    e.preventDefault();
    const n = ui.drag;
    ui.drag = -1;
    let at = -1;
    store.update('drop pattern', (draft) => { at = dropPattern(draft.song, target.v, target.i, target.zone, n); });
    if (at < 0) { say(`Voice ${target.v + 1} has no room for another order entry.`); return; }
    ui.pat = n;
    focusEntry(target.v, at, { zone: 'order' });
    say(`Pattern ${hex2(n)} is now in voice ${target.v + 1} entry ${hex2(at)}.`);
  });

  // ---- the bar ---------------------------------------------------------------------------

  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('mousedown', onMouseDown);
  instrumentSelect.addEventListener('change', () => {
    setSelection({ instrument: Number(instrumentSelect.value) });
    container.focus();
  });
  container.querySelector('.ed-instbar').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    if (!button) return;
    const s = sel();
    if (button.dataset.act === 'instNote') editPattern('set instrument', (ev) => setNoteInstrument(ev, ui.row, s.instrument));
    else editPattern('set instrument', (ev) => setInstrumentFrom(ev, ui.row, s.instrument));
    container.focus();
  });
  followBox.addEventListener('change', () => { ui.follow = followBox.checked; render(); });

  let scrollQueued = false;
  scroller.addEventListener('wheel', closeInstrumentList, { passive: true });   // not 'scroll': following the song scrolls too
  scroller.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; renderGrid(); });
  });

  // Window size, browser zoom and layout changes alter the pixel size of a rem: measure again.
  let sizeQueued = false;
  function onResize() {
    if (sizeQueued) return;
    sizeQueued = true;
    requestAnimationFrame(() => {
      sizeQueued = false;
      closeInstrumentList();
      panel.autoCollapse(container.clientWidth < NARROW_REM * rootPx());
      if (measureSizes()) render(); else renderGrid();
    });
  }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (resizeObserver) resizeObserver.observe(container);
  window.addEventListener('resize', onResize);

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
      closeInstrumentList();
      if (change.kind === 'load') { ui.shown = [0, 0, 0]; ui.row = 0; ui.pat = -1; ui.entryKey = ''; adoptSelection(); }
      render();
    }
  });

  adoptSelection();
  panel.autoCollapse(container.clientWidth < NARROW_REM * rootPx());
  render();

  return {
    destroy() {
      unsubscribe();
      closeInstrumentList();
      panel.destroy();
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(ui.messageTimer);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
    },
  };
}
