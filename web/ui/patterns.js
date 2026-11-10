// patterns.js - the Patterns panel: every pattern of the song in a list, with its name,
// size, which voices use it (or "unused"), and the actions on a pattern.
//
// The panel only shows things and reports what the person did; it never touches the
// song. editor.js passes a `view` to render() and answers the `hooks`, and does the
// real work through store.update (so every action is one undo step).
//
//   view  = { usage, selected, here, playing, entry }
//           usage    patternUsage(song): one record per pattern (editor-logic.js)
//           selected the pattern number picked in this list (-1 = none)
//           here     the pattern shown in the grid, i.e. the one of the current order entry (-1 = none)
//           playing  [pattern number or -1] for each voice: what the song is playing right now
//           entry    short text for the current order entry, e.g. "voice 1, entry 02"
//   hooks = { select, use, insert, create, duplicate, remove, removeUnused, rename, jump, drag, leave }
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { deleteRefusal, usageSummary } from './editor-logic.js';

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const CONFIRM_MS = 4000;      // "Delete unused" asks twice; the second click must come within this time

export function createPatternsPanel(host, hooks) {
  let view = { usage: [], selected: -1, here: -1, playing: [-1, -1, -1], entry: '' };
  let onlyUnused = false;
  let confirmUntil = 0;
  let confirmTimer = 0;
  let signature = '';
  const rows = [];                       // one element per pattern number, reused between renders

  host.classList.add('pt-panel');
  host.innerHTML = `
    <div class="pt-head">
      <b class="pt-title">Patterns</b>
      <span class="pt-count" data-role="count"></span>
      <button type="button" class="pt-fold" data-role="fold" aria-expanded="true"
              title="Hide the pattern list to give the grid more room">&#9664;</button>
    </div>
    <div class="pt-body">
      <div class="pt-tools">
        <button type="button" data-act="create" title="New pattern: make an empty pattern. It is not used anywhere until you put it in an order entry.">New</button>
        <button type="button" data-act="removeUnused" title="Delete every pattern that no order entry uses">Delete unused</button>
        <label class="pt-filter" title="Show only the patterns that no order entry uses"><input type="checkbox" data-role="filter"> unused only</label>
      </div>
      <div class="pt-list" data-role="list" tabindex="0" role="listbox" aria-label="Patterns"
           aria-describedby="pt-help"></div>
      <div class="pt-foot">
        <div class="pt-sel" data-role="selected" id="pt-help"></div>
        <div class="pt-acts">
          <button type="button" data-act="use">Use in entry</button>
          <button type="button" data-act="insert">Add entry</button>
          <button type="button" data-act="duplicate">Duplicate</button>
          <button type="button" data-act="rename">Rename</button>
          <button type="button" data-act="remove">Delete</button>
        </div>
      </div>
    </div>
    <div class="pt-strip" data-role="strip" hidden>Patterns</div>`;
  const $ = (role) => host.querySelector(`[data-role="${role}"]`);
  const listEl = $('list');
  const countEl = $('count');
  const selectedEl = $('selected');
  const filterBox = $('filter');
  const foldButton = $('fold');
  const stripEl = $('strip');

  const record = (n) => view.usage[n] || null;
  const visible = (r) => !onlyUnused || r.unused;

  // ---- building rows ------------------------------------------------------------------

  function createRow(n) {
    const row = document.createElement('div');
    row.className = 'pt';
    row.dataset.n = String(n);
    row.setAttribute('role', 'option');
    row.innerHTML = `
      <span class="pt-no" draggable="true"></span>
      <input class="pt-name" type="text" maxlength="24" spellcheck="false" autocomplete="off" placeholder="(unnamed)">
      <span class="pt-badge">unused</span>
      <span class="pt-info"></span>
      <span class="pt-uses"></span>`;
    row._no = row.querySelector('.pt-no');
    row._name = row.querySelector('.pt-name');
    row._badge = row.querySelector('.pt-badge');
    row._info = row.querySelector('.pt-info');
    row._uses = row.querySelector('.pt-uses');
    row._state = '';
    row._no.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', `pattern ${hex2(n)}`);
      e.dataTransfer.effectAllowed = 'copy';
      row.classList.add('dragging');
      hooks.drag(Number(row.dataset.n));
    });
    row._no.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      hooks.drag(-1);
    });
    return row;
  }

  function updateRow(row, r) {
    const state = JSON.stringify([r, r.n === view.selected, r.n === view.here, view.playing.includes(r.n), visible(r)]);
    if (row._state === state) return;
    row._state = state;
    row.dataset.n = String(r.n);
    row.hidden = !visible(r);
    row.classList.toggle('selected', r.n === view.selected);
    row.classList.toggle('here', r.n === view.here);
    row.classList.toggle('playing', view.playing.includes(r.n));
    row.classList.toggle('is-unused', r.unused);
    row.setAttribute('aria-selected', String(r.n === view.selected));
    row._no.textContent = hex2(r.n);
    row._no.title = `Pattern ${hex2(r.n)}. Drag it onto an order entry (replaces its pattern) or between two entries (inserts a new entry).`;
    if (document.activeElement !== row._name) row._name.value = r.name;
    row._name.setAttribute('aria-label', `Name of pattern ${hex2(r.n)}`);
    row._badge.hidden = !r.unused;
    row._info.textContent = `${r.ticks} ticks, ${r.notes} notes, ${r.bytes} B`;
    row._info.title = `${r.ticks} ticks long, ${r.notes} notes, ${r.bytes} ${r.bytes === 1 ? 'byte' : 'bytes'} in the song data`;
    const chips = r.byVoice.map((count, voice) => {
      if (!count) return '';
      const where = r.users.filter((u) => u.voice === voice).map((u) => hex2(u.index)).join(', ');
      return `<button type="button" class="pt-use" data-voice="${voice}" title="Voice ${voice + 1} uses it in ${count} ${count === 1 ? 'entry' : 'entries'} (${where}). Click to go there.">V${voice + 1} x${count}</button>`;
    }).join('');
    row._uses.innerHTML = chips;
  }

  // ---- render -------------------------------------------------------------------------------

  function render(next) {
    view = next;
    const sig = JSON.stringify([view.usage, view.selected, view.here, view.playing, view.entry, onlyUnused, confirmUntil > Date.now()]);
    if (sig === signature) return;
    signature = sig;

    while (rows.length < view.usage.length) {
      const row = createRow(rows.length);
      rows.push(row);
      listEl.append(row);
    }
    while (rows.length > view.usage.length) rows.pop().remove();
    view.usage.forEach((r, n) => updateRow(rows[n], r));

    const unused = view.usage.filter((r) => r.unused).length;
    countEl.textContent = `${view.usage.length}${unused ? `, ${unused} unused` : ''}`;
    countEl.classList.toggle('warn', unused > 0);
    const removeUnused = host.querySelector('[data-act="removeUnused"]');
    removeUnused.classList.toggle('is-off', unused === 0);
    removeUnused.setAttribute('aria-disabled', String(unused === 0));
    removeUnused.textContent = confirmUntil > Date.now() ? `Really delete ${unused}?` : 'Delete unused';
    removeUnused.title = unused === 0 ? 'Every pattern is used by an order entry.' : `Delete the ${unused} pattern${unused === 1 ? '' : 's'} no order entry uses (undo brings them back)`;

    const hidden = onlyUnused && unused === 0;
    listEl.dataset.empty = view.usage.length === 0 ? 'No patterns yet. Press New.' : hidden ? 'Every pattern is used.' : '';
    renderFooter();
  }

  function renderFooter() {
    const r = record(view.selected);
    const entryText = view.entry || 'the current entry';
    const set = (act, off) => {
      const button = host.querySelector(`[data-act="${act}"]`);
      button.classList.toggle('is-off', off);
      button.setAttribute('aria-disabled', String(off));
      return button;
    };
    const button = (act) => host.querySelector(`[data-act="${act}"]`);
    if (!r) {
      selectedEl.textContent = 'Click a pattern to select it.';
      for (const act of ['use', 'insert', 'duplicate', 'rename', 'remove']) { set(act, true); button(act).title = 'Select a pattern first'; }
      return;
    }
    const title = r.name ? `${hex2(r.n)} ${r.name}` : hex2(r.n);
    selectedEl.textContent = `${title}: ${r.bytes} ${r.bytes === 1 ? 'byte' : 'bytes'}, ${r.unused ? 'unused' : `used by ${usageSummary(r)}`}.`;
    set('use', false);
    set('insert', false);
    set('duplicate', false);
    set('rename', false);
    button('use').title = `Put pattern ${hex2(r.n)} in ${entryText} (double-click the pattern, or Enter in the list)`;
    button('insert').title = `Insert a new order entry for pattern ${hex2(r.n)} after ${entryText} (Shift+Enter in the list)`;
    button('duplicate').title = `Copy pattern ${hex2(r.n)} into a new pattern (it is not used anywhere until you put it in an order entry)`;
    button('rename').title = `Rename pattern ${hex2(r.n)} (F2)`;
    const refusal = deleteRefusal(r);
    set('remove', Boolean(refusal));
    button('remove').title = refusal || `Delete pattern ${hex2(r.n)}. The patterns after it move down by one, the order entries follow.`;
  }

  // ---- what the person does ------------------------------------------------------------------

  function selectedRecord() { return record(view.selected); }

  function refuseIfOff(button) {
    if (button.getAttribute('aria-disabled') !== 'true') return false;
    hooks.say(button.title);
    return true;
  }

  const actions = {
    create: () => hooks.create(),
    use: () => hooks.use(view.selected),
    insert: () => hooks.insert(view.selected),
    duplicate: () => hooks.duplicate(view.selected),
    rename: () => startRename(view.selected),
    remove: () => hooks.remove(view.selected),
    removeUnused() {
      if (confirmUntil < Date.now()) {
        confirmUntil = Date.now() + CONFIRM_MS;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmUntil = 0; signature = ''; render(view); }, CONFIRM_MS);
        signature = '';
        render(view);
        return;
      }
      confirmUntil = 0;
      clearTimeout(confirmTimer);
      hooks.removeUnused();
    },
  };

  host.addEventListener('click', (event) => {
    const chip = event.target.closest('.pt-use');
    if (chip) {
      const row = chip.closest('.pt');
      hooks.jump(Number(row.dataset.n), Number(chip.dataset.voice));
      return;
    }
    const button = event.target.closest('button[data-act]');
    if (button) {
      if (refuseIfOff(button)) return;
      actions[button.dataset.act]();
    }
  });

  // Folding is the person's choice once they have clicked it; until then the editor folds the
  // panel by itself when the window is too narrow for it (see setCollapsed below).
  let chosen = false;
  foldButton.addEventListener('click', () => { chosen = true; setCollapsed(true); });
  stripEl.addEventListener('click', () => { chosen = true; setCollapsed(false); });
  function setCollapsed(collapsed) {
    host.classList.toggle('collapsed', collapsed);
    stripEl.hidden = !collapsed;
    foldButton.setAttribute('aria-expanded', String(!collapsed));
  }
  stripEl.setAttribute('role', 'button');
  stripEl.tabIndex = 0;
  stripEl.title = 'Show the pattern list';
  stripEl.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chosen = true; setCollapsed(false); } });

  filterBox.addEventListener('change', () => { onlyUnused = filterBox.checked; signature = ''; render(view); });

  listEl.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.pt-use')) return;
    const row = event.target.closest('.pt');
    if (row) hooks.select(Number(row.dataset.n));
  });
  listEl.addEventListener('dblclick', (event) => {
    if (event.target.closest('.pt-name, .pt-use')) return;
    const row = event.target.closest('.pt');
    if (row) hooks.use(Number(row.dataset.n));
  });

  // Names are edited right in the list. Enter or Escape leaves the box, the change is kept
  // when it was entered (change event) and one undo step per name.
  listEl.addEventListener('change', (event) => {
    if (!event.target.classList.contains('pt-name')) return;
    hooks.rename(Number(event.target.closest('.pt').dataset.n), event.target.value.trim());
  });
  listEl.addEventListener('keydown', (event) => {
    if (event.target.classList.contains('pt-name')) {
      if (event.key === 'Enter' || event.key === 'Escape') {
        if (event.key === 'Escape') event.target.value = (record(Number(event.target.closest('.pt').dataset.n)) || { name: '' }).name;
        event.preventDefault();
        listEl.focus();
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const shown = view.usage.filter(visible).map((r) => r.n);
    const at = shown.indexOf(view.selected);
    const pick = (i) => {
      if (shown.length) hooks.select(shown[Math.max(0, Math.min(shown.length - 1, i))]);
      scrollToSelected();
    };
    let handled = true;
    switch (event.key) {
      case 'ArrowUp': pick(at < 0 ? shown.length - 1 : at - 1); break;
      case 'ArrowDown': pick(at < 0 ? 0 : at + 1); break;
      case 'Home': pick(0); break;
      case 'End': pick(shown.length - 1); break;
      case 'Enter':
        if (selectedRecord()) { if (event.shiftKey) hooks.insert(view.selected); else hooks.use(view.selected); }
        break;
      case 'Insert': if (selectedRecord()) hooks.insert(view.selected); break;
      case 'Delete': case 'Backspace': {
        const button = host.querySelector('[data-act="remove"]');
        if (selectedRecord() && !refuseIfOff(button)) hooks.remove(view.selected);
        break;
      }
      case 'F2': if (selectedRecord()) startRename(view.selected); break;
      case 'Escape': hooks.leave(); break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  });

  function startRename(n) {
    const row = rows[n];
    if (!row) return;
    row.hidden = false;
    row._name.focus();
    row._name.select();
  }

  function scrollToSelected() {
    const row = rows[view.selected];
    if (!row || row.hidden) return;
    const top = row.offsetTop;
    if (top < listEl.scrollTop) listEl.scrollTop = top;
    else if (top + row.offsetHeight > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = top + row.offsetHeight - listEl.clientHeight;
  }

  return {
    render,
    focus() { listEl.focus(); scrollToSelected(); },
    scrollToSelected,
    expand() { if (host.classList.contains('collapsed')) setCollapsed(false); },
    // Called by the editor when the window gets narrow or wide; ignored once the person has folded or unfolded it.
    autoCollapse(narrow) { if (!chosen) setCollapsed(narrow); },
    destroy() { clearTimeout(confirmTimer); },
  };
}
