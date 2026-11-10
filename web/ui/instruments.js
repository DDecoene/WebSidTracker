// instruments.js - the instrument editor panel.
//
//   mountInstruments(container, store) -> unmount()
//
// Left: the list of instruments (number in hex, name) with New / Duplicate /
// Delete. Right: the editor for the selected instrument
// (store.selection.instrument): presets, waveform, envelope, pulse width,
// vibrato, arpeggio, drum, release, and a small piano to audition the sound.
//
// Every change goes through store.update('edit instrument <field>', ...), so
// it is live while a song plays. The controls are built once and only get new
// values on refresh; they are never rebuilt while you drag, so a slider keeps
// the mouse until you let go. The pure logic (time tables, presets, limits)
// is in instruments-logic.js.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import * as L from './instruments-logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Load the stylesheet that sits next to this file, once.
function ensureStylesheet() {
  const href = new URL('./instruments.css', import.meta.url).href;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href === href || /\/instruments\.css(\?|$)/.test(link.href)) return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

let uid = 0;

// The listing of what each numeric control is. `get`/`set` read and write the
// instrument; `text` is the plain-words value shown to the right.
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const frames = (n) => `${n} frame${n === 1 ? '' : 's'} (${L.formatMs(L.framesToMs(n))})`;

const SECTIONS = [
  {
    title: 'Envelope',
    intro: 'How the volume of a note rises and falls. The times are the real SID times.',
    graph: 'envelope',
    controls: [
      { key: 'attack', label: 'Attack', min: 0, max: 15, digits: 1,
        get: (i) => L.attackOf(i.ad), set: (i, v) => { i.ad = L.withAttack(i.ad, v); },
        text: (v) => L.formatMs(L.ATTACK_MS[v]),
        hint: 'Time to swell up to full volume. 0 is a hard start (2 ms); high values fade the note in.' },
      { key: 'decay', label: 'Decay', min: 0, max: 15, digits: 1,
        get: (i) => L.decayOf(i.ad), set: (i, v) => { i.ad = L.withDecay(i.ad, v); },
        text: (v) => L.formatMs(L.DECAY_MS[v]),
        hint: 'Time to fall from full volume down towards the sustain level. Short decay with sustain 0 makes a plucked sound.' },
      { key: 'sustain', label: 'Sustain', min: 0, max: 15, digits: 1,
        get: (i) => L.sustainOf(i.sr), set: (i, v) => { i.sr = L.withSustain(i.sr, v); },
        text: (v) => `${v}/15 (${Math.round((v / 15) * 100)} %)`,
        hint: 'The volume the note rests at while it is held. 0 lets the note die away by itself, 15 keeps it at full volume.' },
      { key: 'release', label: 'Release', min: 0, max: 15, digits: 1,
        get: (i) => L.releaseOf(i.sr), set: (i, v) => { i.sr = L.withRelease(i.sr, v); },
        inactive: true,
        text: (v) => (v === 0 ? 'not used' : `${v} is ignored`),
        hint: 'Not used. The player ends every note with its own clean release (see "Release frames" below), so a release value here would never be heard. Keep it at 0.' },
    ],
  },
  {
    title: 'Pulse width',
    intro: 'The shape of the pulse wave: 50 % is a hollow square, small or large values sound thin and nasal. Only audible with the pulse waveform.',
    graph: 'pulse',
    dimUnless: 'pulse',
    controls: [
      { key: 'pw', label: 'Start width', min: 0, max: 4095, digits: 3,
        get: (i) => i.pw, set: (i, v) => { i.pw = v; },
        text: (v) => `${L.pwPercent(v).toFixed(1)} %`,
        hint: 'Pulse width at the start of every note.' },
      { key: 'pwStep', label: 'Sweep step', min: -128, max: 127, digits: 2,
        get: (i) => i.pwStep, set: (i, v) => { i.pwStep = v; },
        text: (v) => (v === 0 ? 'no sweep' : `${signed(v)} per frame`),
        hint: 'How much the width moves every frame while the note plays. This is the movement that makes a pulse sound fat. 0 keeps it still.' },
      { key: 'pwMin', label: 'Sweep min', min: 0, max: 255, digits: 2,
        get: (i) => i.pwMin,
        set: (i, v) => { i.pwMin = v; if (i.pwMax < v) i.pwMax = v; },
        text: (v) => `${L.unitsPercent(v).toFixed(1)} %`,
        hint: 'The sweep turns around here (units of 16, shown as a percentage). Stay away from 0 %: the sound disappears.' },
      { key: 'pwMax', label: 'Sweep max', min: 0, max: 255, digits: 2,
        get: (i) => i.pwMax,
        set: (i, v) => { i.pwMax = v; if (i.pwMin > v) i.pwMin = v; },
        text: (v) => `${L.unitsPercent(v).toFixed(1)} %`,
        hint: 'The upper turning point of the sweep.' },
    ],
  },
  {
    title: 'Vibrato',
    intro: 'A pitch wobble that starts a while after the note began, like a singer or a violin player.',
    controls: [
      { key: 'vibDelay', label: 'Delay', min: 0, max: 255, sliderMax: 100, digits: 2,
        get: (i) => i.vibDelay, set: (i, v) => { i.vibDelay = v; },
        text: (v) => frames(v),
        hint: 'Frames after the start of the note before the vibrato begins. Long notes get life; short notes stay clean.' },
      { key: 'vibDepth', label: 'Depth', min: 0, max: 255, sliderMax: 48, digits: 2,
        get: (i) => i.vibDepth, set: (i, v) => { i.vibDepth = v; },
        text: (v) => (v === 0 ? 'off' : `±${Math.round(L.vibratoCents(v))} cents`),
        hint: 'How wide the wobble is, in 1/16 of the way to the next semitone (16 = a whole semitone). It is equally wide in bass and treble. 0 turns vibrato off.' },
      { key: 'vibSpeed', label: 'Speed', min: 0, max: 255, sliderMax: 16, digits: 2,
        get: (i) => i.vibSpeed, set: (i, v) => { i.vibSpeed = v; },
        text: (v) => (v === 0 ? 'stopped' : `${L.vibratoHz(v).toFixed(1)} Hz`),
        hint: 'Frames per half wobble. Low numbers are fast. 3 to 5 sounds natural.' },
    ],
  },
  {
    title: 'Arpeggio',
    controls: [
      { key: 'arp', label: 'Offset', min: -96, max: 96, sliderMin: -24, sliderMax: 24, digits: 2,
        get: (i) => i.arp, set: (i, v) => { i.arp = v; },
        text: (v) => (v === 0 ? 'off' : `${signed(v)} semitones`),
        hint: 'Every frame the pitch jumps between the note and the note plus this many semitones: 12 is an octave, 7 a fifth, 4 a major third. The fast flutter sounds like a chord.' },
    ],
  },
  {
    title: 'Drum',
    intro: 'Setting "Noise frames" above 0 turns the instrument into a drum: it starts with a burst of noise, then the waveform above plays on from the note\'s pitch and falls. Play drums on low notes for kicks and higher notes for snares and hats.',
    summary: 'drum',
    controls: [
      { key: 'drumNoise', label: 'Noise frames', min: 0, max: 255, sliderMax: 12, digits: 2,
        get: (i) => i.drumNoise, set: (i, v) => { i.drumNoise = v; },
        text: (v) => (v === 0 ? 'not a drum' : frames(v)),
        hint: 'How long the noise lasts at the start. 1 gives a click (kick), 2 to 3 a snare crack or hat.' },
      { key: 'drumFall', label: 'Fall', min: 0, max: 255, digits: 2,
        get: (i) => i.drumFall, set: (i, v) => { i.drumFall = v; },
        text: (v) => (v === 0 ? 'stays level' : `${v} per frame`),
        hint: 'After the noise, how fast the tone drops each frame (frequency register units). Large values give a quick "boom"; 0 keeps the pitch, as for a hat.' },
    ],
  },
  {
    title: 'Release frames',
    controls: [
      { key: 'releaseFrames', label: 'Release frames', field: 'release', min: 0, max: 255, sliderMax: 16, digits: 2,
        get: (i) => i.release, set: (i, v) => { i.release = v; },
        text: (v) => frames(v),
        hint: 'The last frames of every note are used to switch the sound off cleanly, so that the next note starts on time and without a click. The standard value is 2. With a decay above 0 the SID needs two frames for this, so 0 and 1 are played as 2, and a note of 1 or 2 frames keeps its gate open. The first frame of a note always sounds.' },
    ],
  },
];

export function mountInstruments(container, store) {
  ensureStylesheet();
  const id = `inst${uid++}`;
  const refreshers = [];

  // ----- the instrument currently edited ---------------------------------

  const selected = () => store.selection.instrument;
  const current = () => store.project.instruments[selected()] || null;

  // Change the selected instrument. `field` names the change for undo.
  function commit(field, fn) {
    const index = selected();
    store.update(`edit instrument ${field}`, (draft) => {
      const inst = draft.instruments[index];
      if (inst) fn(inst);
    });
  }

  // ----- DOM skeleton -----------------------------------------------------

  const root = el('div', { class: 'inst-panel', tabindex: '-1' });
  const listCol = el('div', { class: 'inst-list-col' });
  const editCol = el('div', { class: 'inst-edit-col' });
  root.append(listCol, editCol);
  container.append(root);

  // ----- message line -------------------------------------------------------

  const msg = el('div', { class: 'inst-msg', role: 'status', hidden: true });
  function showMessage(text, kind = 'info', actions = []) {
    msg.replaceChildren(el('span', { text }));
    for (const [label, fn] of actions) {
      msg.append(el('button', { type: 'button', class: 'inst-btn', text: label }));
      msg.lastChild.addEventListener('click', () => { clearMessage(); fn(); });
    }
    msg.dataset.kind = kind;
    msg.hidden = false;
  }
  function clearMessage() {
    msg.hidden = true;
    msg.replaceChildren();
  }

  // ----- list ---------------------------------------------------------------

  const listEl = el('div', { class: 'inst-list', role: 'listbox', 'aria-label': 'Instruments' });
  const btnNew = el('button', { type: 'button', class: 'inst-btn', text: 'New', title: 'Add a new instrument in the first free slot' });
  const btnDup = el('button', { type: 'button', class: 'inst-btn', text: 'Duplicate', title: 'Copy the selected instrument to a free slot' });
  const btnDel = el('button', { type: 'button', class: 'inst-btn inst-danger', text: 'Delete', title: 'Delete the selected instrument' });
  listCol.append(
    el('h2', { class: 'inst-title', text: 'Instruments' }),
    el('div', { class: 'inst-list-buttons' }, btnNew, btnDup, btnDel),
    listEl,
    msg,
  );

  let listSignature = null;
  function renderList() {
    const instruments = store.project.instruments;
    const sel = selected();
    const signature = instruments.map((i) => (i ? i.name : '\u0000')).join('\u0001') + `|${sel}`;
    if (signature === listSignature) return;
    listSignature = signature;
    const hadFocus = listEl.contains(document.activeElement);
    const rows = [];
    instruments.forEach((inst, n) => {
      if (!inst) return;
      const row = el('button', {
        type: 'button', class: 'inst-item', role: 'option', 'data-n': n,
        'aria-selected': n === sel ? 'true' : 'false',
        tabindex: n === sel ? '0' : '-1',
      }, el('span', { class: 'inst-num', text: L.hex(n) }), el('span', { class: 'inst-name', text: inst.name || '(unnamed)' }));
      rows.push(row);
    });
    // Selected slot is empty: still make the list reachable by keyboard.
    if (!instruments[sel] && rows.length) rows[0].tabIndex = 0;
    listEl.replaceChildren(...rows);
    if (!rows.length) listEl.append(el('p', { class: 'inst-empty', text: 'No instruments yet. Press New.' }));
    if (hadFocus) listEl.querySelector('[aria-selected="true"]')?.focus();
  }

  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.inst-item');
    if (!item) return;
    clearMessage();
    store.select({ instrument: Number(item.dataset.n) });
  });
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...listEl.querySelectorAll('.inst-item')];
    const at = items.findIndex((i) => Number(i.dataset.n) === selected());
    const next = items[Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    store.select({ instrument: Number(next.dataset.n) });
  });

  function addInstrument(make, label) {
    const slot = L.firstFreeSlot(store.project.instruments);
    if (slot < 0) { showMessage('All 256 instrument slots are in use.', 'warn'); return; }
    clearMessage();
    store.update(label, (draft) => L.setSlot(draft.instruments, slot, make(draft)));
    store.select({ instrument: slot });
  }
  btnNew.addEventListener('click', () => {
    addInstrument((draft) => L.blankInstrument(`New ${L.hex(L.firstFreeSlot(draft.instruments))}`), 'new instrument');
  });
  btnDup.addEventListener('click', () => {
    const src = current();
    if (!src) { showMessage('Select an existing instrument to duplicate.', 'warn'); return; }
    addInstrument(() => ({ ...src, name: L.copyName(src.name) }), 'duplicate instrument');
  });

  function deleteSelected() {
    const index = selected();
    store.update('delete instrument', (draft) => {
      draft.instruments[index] = null;
      L.trimEmptySlots(draft.instruments);
    });
    const left = store.project.instruments;
    let target = -1;
    for (let n = Math.min(index, left.length - 1); n >= 0 && target < 0; n--) if (left[n]) target = n;
    for (let n = index + 1; n < left.length && target < 0; n++) if (left[n]) target = n;
    store.select({ instrument: Math.max(0, target) });
  }
  btnDel.addEventListener('click', () => {
    if (!current()) { showMessage('That slot is already empty.', 'info'); return; }
    const { count, patterns } = L.instrumentUsage(store.project, selected());
    if (count === 0) { clearMessage(); deleteSelected(); return; }
    const where = patterns.length > 6 ? `${patterns.slice(0, 6).join(', ')} and more` : patterns.join(', ');
    showMessage(
      `Instrument ${L.hex(selected())} is selected ${count} time${count === 1 ? '' : 's'} in pattern${patterns.length === 1 ? '' : 's'} ${where}. ` +
      'Those notes will play silence or the wrong sound if you delete it.',
      'warn',
      [['Delete anyway', deleteSelected], ['Keep it', () => {}]],
    );
  });

  // ----- editor: header and presets ----------------------------------------

  const badge = el('span', { class: 'inst-badge' });
  const nameInput = el('input', { type: 'text', class: 'inst-name-input', maxlength: '20', 'aria-label': 'Instrument name', spellcheck: 'false' });
  nameInput.addEventListener('input', () => commit('name', (i) => { i.name = nameInput.value; }));
  const presetHint = el('p', { class: 'inst-hint inst-preset-hint', text: 'Presets replace all fields of this instrument with a starting point.' });
  const presetRow = el('div', { class: 'inst-presets', role: 'group', 'aria-label': 'Presets' });
  for (const preset of L.PRESETS) {
    const b = el('button', { type: 'button', class: 'inst-btn inst-preset', text: preset.name, title: preset.hint });
    b.addEventListener('click', () => {
      commit(`preset ${preset.name}`, (inst) => Object.assign(inst, L.applyPreset(inst, preset)));
      presetHint.textContent = preset.hint;
    });
    for (const ev of ['mouseenter', 'focus']) b.addEventListener(ev, () => { presetHint.textContent = preset.hint; });
    presetRow.append(b);
  }

  const missing = el('div', { class: 'inst-missing' });
  const missingText = el('p');
  const btnCreate = el('button', { type: 'button', class: 'inst-btn', text: 'Create it' });
  btnCreate.addEventListener('click', () => {
    const slot = selected();
    store.update('new instrument', (draft) => L.setSlot(draft.instruments, slot, L.blankInstrument(`New ${L.hex(slot)}`)));
  });
  missing.append(missingText, btnCreate);

  const form = el('div', { class: 'inst-form' });
  form.append(
    el('div', { class: 'inst-head' }, badge, nameInput),
    el('div', { class: 'inst-presets-wrap' }, el('span', { class: 'inst-label-small', text: 'Presets' }), presetRow, presetHint),
  );

  // ----- editor: waveform --------------------------------------------------

  const waveBoxes = {};
  const waveHint = el('p', { class: 'inst-hint' });
  const waveSection = el('fieldset', { class: 'inst-section' }, el('legend', { text: 'Waveform' }));
  const waveGrid = el('div', { class: 'inst-waves' });
  const WAVE_UI = [
    ['triangle', 'Triangle', 'soft, flute-like'],
    ['saw', 'Saw', 'bright and buzzy'],
    ['pulse', 'Pulse', 'full, changes with width'],
    ['noise', 'Noise', 'hiss, for drums and effects'],
    ['ring', 'Ring', 'ring modulation (with triangle)'],
    ['sync', 'Sync', 'hard sync to the voice before'],
  ];
  for (const [flag, label, detail] of WAVE_UI) {
    const box = el('input', { type: 'checkbox', id: `${id}-w-${flag}` });
    box.addEventListener('change', () => commit(`wave ${flag}`, (i) => { i.wave = L.toggleWave(i.wave, flag, box.checked); }));
    waveBoxes[flag] = box;
    waveGrid.append(el('label', { class: 'inst-check', for: box.id, title: detail }, box, el('span', { text: label }), el('small', { text: detail })));
  }
  waveSection.append(
    waveGrid,
    el('p', { class: 'inst-hint', text: 'Triangle, saw and pulse can be combined with each other (a harsher, thinner sound). Noise cannot be mixed: it replaces the others. Ring and sync are colour effects on top.' }),
    waveHint,
  );
  form.append(waveSection);
  refreshers.push((inst) => {
    const f = L.waveFlags(inst.wave);
    for (const flag of Object.keys(waveBoxes)) waveBoxes[flag].checked = f[flag];
    waveHint.textContent = `Control register: $${L.hex(inst.wave)} (${L.waveName(inst.wave)}), gate added by the player.`;
  });

  // ----- editor: numeric sections -----------------------------------------

  function buildControl(spec) {
    const cid = `${id}-${spec.key}`;
    const sMin = spec.sliderMin ?? spec.min;
    const sMax = spec.sliderMax ?? spec.max;
    const range = el('input', { type: 'range', id: cid, min: sMin, max: sMax, step: 1, class: 'inst-range' });
    const number = el('input', { type: 'number', min: spec.min, max: spec.max, step: 1, class: 'inst-number', 'aria-label': `${spec.label} (decimal)` });
    const hexEl = el('span', { class: 'inst-hex', title: 'Value as stored, in hex' });
    const valEl = el('span', { class: 'inst-val' });
    // An inactive control (the release nibble of SR) is shown but cannot be moved. If an old file has a value
    // there, a button sets it to 0; nothing is changed without the user pressing it.
    const clear = spec.inactive ? el('button', { type: 'button', class: 'inst-btn', text: 'Set to 0', hidden: true }) : null;
    if (spec.inactive) {
      range.disabled = true;
      number.disabled = true;
      clear.addEventListener('click', () => commit(spec.field || spec.key, (inst) => spec.set(inst, 0)));
    }
    const field = spec.field || spec.key;
    const write = (raw) => {
      const v = L.clampInt(raw, spec.min, spec.max);
      commit(field, (inst) => spec.set(inst, v));
    };
    range.addEventListener('input', () => write(range.value));
    number.addEventListener('input', () => { if (number.value !== '' && number.value !== '-') write(number.value); });
    number.addEventListener('change', () => { if (number.value === '') refresh(); });
    const row = el('div', { class: 'inst-row' },
      el('label', { for: cid, text: spec.label }), range, number, hexEl, valEl,
      el('p', { class: 'inst-hint', text: spec.hint }),
      ...(clear ? [clear] : []));
    if (spec.inactive) row.classList.add('inst-inactive');
    function refresh() {
      const inst = current();
      if (!inst) return;
      const v = spec.get(inst);
      if (range.value !== String(v)) range.value = v;
      if (number.value !== String(v)) number.value = v;
      hexEl.textContent = `$${L.hex(v, spec.digits)}`;
      valEl.textContent = spec.text(v, inst);
      if (clear) clear.hidden = v === 0;
    }
    refreshers.push(refresh);
    return row;
  }

  // The envelope sketch: attack up, decay down to the sustain level, a held
  // part of fixed length, release down. Segment widths grow with the logarithm
  // of the time, so 2 ms and 8 s both fit.
  function buildEnvelopeGraph() {
    const W = 300, H = 64, top = 6, bottom = H - 4;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'inst-graph', role: 'img', 'aria-label': 'Envelope shape', preserveAspectRatio: 'none' });
    const path = svg('path', { class: 'inst-graph-line' });
    const fill = svg('path', { class: 'inst-graph-fill' });
    s.append(fill, path);
    refreshers.push((inst) => {
      const width = (ms) => 10 + 18 * Math.log10(ms);
      const a = width(L.ATTACK_MS[L.attackOf(inst.ad)]);
      const d = width(L.DECAY_MS[L.decayOf(inst.ad)]);
      const r = width(L.RELEASE_MS[0]);   // the player always releases with SR = 0: the fastest fall
      const hold = 40;
      const k = W / (a + d + hold + r);
      const xs = [0, a * k, (a + d) * k, (a + d + hold) * k, W];
      const sy = bottom - (L.sustainOf(inst.sr) / 15) * (bottom - top);
      const pts = [[xs[0], bottom], [xs[1], top], [xs[2], sy], [xs[3], sy], [xs[4], bottom]];
      const line = pts.map((p, n) => `${n ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      path.setAttribute('d', line);
      fill.setAttribute('d', `${line} Z`);
    });
    return s;
  }

  // The pulse width over about 4 seconds, with the sweep range shaded.
  function buildPulseGraph() {
    const W = 300, H = 70, FRAMES = 200;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'inst-graph', role: 'img', 'aria-label': 'Pulse width over time', preserveAspectRatio: 'none' });
    const y = (pw) => H - (pw / 4096) * H;
    const band = svg('rect', { class: 'inst-graph-band', x: 0, width: W });
    const mid = svg('line', { class: 'inst-graph-grid', x1: 0, x2: W, y1: H / 2, y2: H / 2 });
    const line = svg('polyline', { class: 'inst-graph-line', fill: 'none' });
    const dot = svg('circle', { class: 'inst-graph-dot', r: 3 });
    s.append(band, mid, line, dot);
    const caption = el('p', { class: 'inst-hint inst-graph-caption' });
    refreshers.push((inst) => {
      const lo = Math.min(inst.pwMin, inst.pwMax) * 16;
      const hi = Math.max(inst.pwMin, inst.pwMax) * 16;
      band.setAttribute('y', y(hi));
      band.setAttribute('height', Math.max(1, y(lo) - y(hi)));
      const path = L.sweepPath(inst.pw, inst.pwStep, inst.pwMin, inst.pwMax, FRAMES);
      line.setAttribute('points', path.map((p, n) => `${((n / (FRAMES - 1)) * W).toFixed(1)},${y(p).toFixed(1)}`).join(' '));
      dot.setAttribute('cx', 0);
      dot.setAttribute('cy', y(inst.pw));
      const period = L.sweepPeriodFrames(inst.pwStep, inst.pwMin, inst.pwMax);
      caption.textContent = `Start ${L.pwPercent(inst.pw).toFixed(1)} %. ` + (inst.pwStep === 0
        ? 'No sweep: the width stays where it starts. Graph shows about 4 seconds.'
        : `Sweeps between ${L.unitsPercent(Math.min(inst.pwMin, inst.pwMax)).toFixed(1)} % and ${L.unitsPercent(Math.max(inst.pwMin, inst.pwMax)).toFixed(1)} %, there and back in ${L.formatMs(L.framesToMs(period))}. Graph shows about 4 seconds.`);
    });
    return el('div', { class: 'inst-graph-wrap' }, s, caption);
  }

  for (const section of SECTIONS) {
    const fs = el('fieldset', { class: 'inst-section' }, el('legend', { text: section.title }));
    if (section.intro) fs.append(el('p', { class: 'inst-hint inst-intro', text: section.intro }));
    if (section.graph === 'envelope') fs.append(buildEnvelopeGraph());
    if (section.graph === 'pulse') fs.append(buildPulseGraph());
    for (const spec of section.controls) fs.append(buildControl(spec));
    if (section.summary === 'drum') {
      const line = el('p', { class: 'inst-summary' });
      fs.append(line);
      refreshers.push((inst) => { line.textContent = L.describeDrum(inst); fs.classList.toggle('inst-active', inst.drumNoise > 0); });
    }
    if (section.dimUnless) {
      refreshers.push((inst) => fs.classList.toggle('inst-dim', !L.waveFlags(inst.wave)[section.dimUnless]));
    }
    form.append(fs);
  }

  // ----- editor: audition piano --------------------------------------------

  const octaveLabel = el('span', { class: 'inst-octave-label' });
  const octDown = el('button', { type: 'button', class: 'inst-btn', text: '−', 'aria-label': 'Octave down', title: 'Octave down ([)' });
  const octUp = el('button', { type: 'button', class: 'inst-btn', text: '+', 'aria-label': 'Octave up', title: 'Octave up (])' });
  const setOctave = (o) => store.select({ octave: Math.max(0, Math.min(6, o)) });
  octDown.addEventListener('click', () => setOctave(store.selection.octave - 1));
  octUp.addEventListener('click', () => setOctave(store.selection.octave + 1));

  const piano = el('div', { class: 'inst-piano', role: 'group', 'aria-label': 'Audition keyboard' });
  const letterOf = {};
  for (const [k, n] of Object.entries(L.PIANO_KEYS)) letterOf[n] = k.toUpperCase();
  const BLACK = new Set([1, 3, 6, 8, 10]);
  let whites = 0;
  for (let n = 0; n < 24; n++) {
    const black = BLACK.has(n % 12);
    const key = el('button', { type: 'button', class: black ? 'inst-key inst-black' : 'inst-key inst-white', tabindex: '-1', 'data-n': n, 'aria-label': `Key ${letterOf[n]}` });
    key.append(el('span', { text: letterOf[n] }));
    if (black) key.style.left = `calc(${whites} * 100% / 14 - 100% / 14 * 0.3)`;
    else whites++;
    piano.append(key);
  }
  piano.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.inst-key');
    if (!key) return;
    e.preventDefault();
    audition(store.selection.octave * 12 + Number(key.dataset.n));
  });

  function audition(pitch) {
    if (pitch < 0 || pitch > 95 || !current()) return;
    store.auditionNote(selected(), pitch);
    const key = piano.querySelector(`[data-n="${pitch - store.selection.octave * 12}"]`);
    if (key) {
      key.classList.add('inst-down');
      setTimeout(() => key.classList.remove('inst-down'), 150);
    }
  }

  form.append(el('fieldset', { class: 'inst-section inst-audition' },
    el('legend', { text: 'Audition' }),
    el('p', { class: 'inst-hint', text: 'Click the keys, or press the piano keys (Z S X D C V ... on the lower row, Q 2 W 3 E ... on the upper row) while the focus is in this panel. [ and ] change the octave.' }),
    el('div', { class: 'inst-octave' }, el('span', { text: 'Octave' }), octDown, octaveLabel, octUp),
    piano));

  editCol.append(form, missing);

  // Piano keys from the computer keyboard, when focus is in this panel but not
  // in a text or number field or a drop-down.
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t.matches('textarea, select, input[type="text"], input[type="number"]')) return;
    if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      setOctave(store.selection.octave + (e.key === ']' ? 1 : -1));
      return;
    }
    const pitch = L.pianoPitch(e.key, store.selection.octave);
    if (pitch === null) return;
    e.preventDefault();
    audition(pitch);
  });

  // ----- refresh --------------------------------------------------------------

  function refresh() {
    renderList();
    const inst = current();
    form.hidden = !inst;
    missing.hidden = !!inst;
    octaveLabel.textContent = String(store.selection.octave);
    if (!inst) {
      missingText.textContent = `Instrument ${L.hex(selected())} is an empty slot.`;
      return;
    }
    badge.textContent = L.hex(selected());
    if (nameInput.value !== inst.name) nameInput.value = inst.name;
    for (const fn of refreshers) fn(inst);
  }

  const unsubscribe = store.subscribe((change) => {
    if (change.kind === 'playhead') return;
    if (change.kind === 'select' || change.kind === 'load') clearMessage();
    refresh();
  });
  refresh();

  return function unmount() {
    unsubscribe();
    root.remove();
  };
}

// Key help for the shared help panel: [key, description].
export function instrumentKeyHelp() {
  return [
    ['Z S X D C V G B H N J M', 'Audition: lower octave (in the instrument panel)'],
    ['Q 2 W 3 E R 5 T 6 Y 7 U', 'Audition: upper octave'],
    ['[ ]', 'Octave down / up for auditioning'],
    ['Up / Down (in the list)', 'Select the previous / next instrument'],
  ];
}
