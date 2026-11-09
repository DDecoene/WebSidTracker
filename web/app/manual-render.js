// manual-render.js - turns the manual data (manual.js) into DOM, and searches it.
//
// The manual is plain data: sections of blocks. A block is one of
//   { type: 'p', text }                      a paragraph
//   { type: 'h', text }                      a sub heading
//   { type: 'ul' | 'ol', items: [text] }     a list
//   { type: 'tip' | 'note', text }           a callout ("Tip" / "Note")
//   { type: 'table', head: [text], rows: [[text]] }
//   { type: 'keys', rows: [[keys, text]] }   a key table; or { type: 'keys', source: 'app' | 'editor' | 'instrument' }
//                                            taken from the key lists the program itself provides
//   { type: 'code', text }                   a code listing
//   { type: 'piano', lower, upper }          the computer keyboard drawn as a piano
//
// Text has a tiny inline markup: **bold**, *italic*, `code`, [[Key]] (a key cap) and
// [label](#section-id) or [label](https://...) (a link). Everything is built with createElement
// and textContent; the text is never parsed as HTML, so markup characters in it are harmless.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

// ---- inline markup (pure) -----------------------------------------------------------

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only in-page anchors, relative paths and http(s) links are allowed as link targets. */
export function isSafeHref(href) {
  return /^#[\w-]+$/.test(href)
    || /^https?:\/\/[^\s"<>]+$/i.test(href)
    || /^(?!\/)[\w./-]+(\?[\w=&.-]+)?(#[\w-]+)?$/.test(href);   // relative: no colon, so no "javascript:"
}

/** "a **b** c" -> [{ t: 'text', text: 'a ' }, { t: 'b', text: 'b' }, { t: 'text', text: ' c' }]. */
export function parseInline(text) {
  const tokens = [];
  let last = 0;
  for (const match of String(text).matchAll(INLINE)) {
    if (match.index > last) tokens.push({ t: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) tokens.push({ t: 'b', text: match[1] });
    else if (match[2] !== undefined) tokens.push({ t: 'i', text: match[2] });
    else if (match[3] !== undefined) tokens.push({ t: 'code', text: match[3] });
    else if (match[4] !== undefined) tokens.push({ t: 'kbd', text: match[4] });
    else if (isSafeHref(match[6])) tokens.push({ t: 'a', text: match[5], href: match[6] });
    else tokens.push({ t: 'text', text: match[5] });          // an unsafe target: keep the label only
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ t: 'text', text: text.slice(last) });
  return tokens;
}

/** The text without markup, for searching. */
export function plainText(text) {
  return parseInline(text).map((token) => token.text).join('');
}

// ---- key caps for the key tables (pure) -------------------------------------------------

const SEPARATOR = /(\s*\(\s*|\s*\)\s*| \/ |, |\s*\b(?:or|and)\b\s*)/;

// Separators between key caps are shown as plain text; spaces around brackets are normalised.
function plainSeparator(piece) {
  const word = piece.trim();
  if (word === '(') return ' (';
  if (word === ')') return ')';
  if (word === '/') return ' / ';
  if (word === ',') return ', ';
  return ` ${word} `;           // "or", "and"
}

/**
 * Split the key text of a key table into caps and plain separators:
 * "Up / Down, PageUp / PageDown" -> Up (cap), " / ", Down (cap), ", ", PageUp (cap), ...
 * "z s x d" -> four caps. A label before a colon ("Order list: s, l, p") stays plain text.
 * @returns {{ cap: boolean, text: string }[]}
 */
export function keyCaps(text) {
  const parts = [];
  let rest = String(text).replace(/\s+/g, ' ').trim();
  const label = /^([A-Za-z ]+: )(.*)$/.exec(rest);
  if (label) { parts.push({ cap: false, text: label[1] }); rest = label[2]; }
  rest.split(SEPARATOR).forEach((piece, index) => {
    if (piece === '') return;
    if (index % 2 === 1) {
      const separator = plainSeparator(piece);
      parts.push({ cap: false, text: parts.at(-1)?.text.endsWith('(') ? separator.trimStart() : separator });   // "(or", not "( or"
      return;
    }
    const words = piece.split(' ');
    if (words.length > 1 && words.every((word) => word.length === 1)) {
      words.forEach((word, i) => { if (i > 0) parts.push({ cap: false, text: ' ' }); parts.push({ cap: true, text: word }); });
    } else {
      parts.push({ cap: true, text: piece });
    }
  });
  return parts;
}

// ---- searching (pure) --------------------------------------------------------------------

/** All the text of a block, markup removed. `keySources` supplies the generated key tables. */
export function blockText(block, keySources = {}) {
  const parts = [];
  if (block.text) parts.push(plainText(block.text));
  if (block.items) parts.push(...block.items.map(plainText));
  if (block.head) parts.push(...block.head.map(plainText));
  const rows = block.rows ?? (block.source ? keySources[block.source] ?? [] : []);
  for (const row of rows) parts.push(...row.map(plainText));
  return parts.join(' ');
}

export function sectionText(section, keySources = {}) {
  return [section.title, ...section.blocks.map((block) => blockText(block, keySources))].join(' ').toLowerCase();
}

/**
 * The sections that contain every word of `query` (case does not matter). An empty query
 * matches all. Returns the section ids in manual order.
 */
export function searchSections(sections, query, keySources = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections.map((section) => section.id);
  return sections
    .filter((section) => {
      const text = sectionText(section, keySources);
      return words.every((word) => text.includes(word));
    })
    .map((section) => section.id);
}

// ---- DOM ---------------------------------------------------------------------------------

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.setAttribute('class', className);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Inline markup -> an array of nodes. */
export function renderInline(doc, text) {
  return parseInline(text).map((token) => {
    switch (token.t) {
      case 'b': return el(doc, 'strong', '', token.text);
      case 'i': return el(doc, 'em', '', token.text);
      case 'code': return el(doc, 'code', '', token.text);
      case 'kbd': return el(doc, 'kbd', '', token.text);
      case 'a': {
        const link = el(doc, 'a', '', token.text);
        link.setAttribute('href', token.href);
        if (/^https?:/.test(token.href)) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener'); }
        return link;
      }
      default: return doc.createTextNode(token.text);
    }
  });
}

function withInline(doc, node, text) {
  node.append(...renderInline(doc, text));
  return node;
}

function renderKeys(doc, rows) {
  const table = el(doc, 'dl', 'man-keys');
  for (const [keys, what] of rows) {
    const dt = el(doc, 'dt');
    for (const part of keyCaps(keys)) {
      dt.append(part.cap ? el(doc, 'kbd', '', part.text) : doc.createTextNode(part.text));
    }
    table.append(dt, withInline(doc, el(doc, 'dd'), what));
  }
  return table;
}

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
const NOTE_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// One octave of the computer keyboard: the white keys in a row, the black keys in a row above,
// each black key sitting between two white ones (a 14 column grid, a white key is 2 columns wide).
function renderPianoRow(doc, label, keys) {
  const figure = el(doc, 'div', 'man-piano-row');
  figure.append(el(doc, 'div', 'man-piano-label', label));
  const board = el(doc, 'div', 'man-piano');
  let white = 0;
  [...keys].forEach((key, semitone) => {
    const cap = el(doc, 'span', WHITE.has(semitone) ? 'white' : 'black');
    cap.append(el(doc, 'kbd', '', key), el(doc, 'small', '', NOTE_LETTERS[semitone]));
    if (WHITE.has(semitone)) {
      cap.setAttribute('style', `grid-column: ${white * 2 + 1} / span 2; grid-row: 2`);
      white += 1;
    } else {
      cap.setAttribute('style', `grid-column: ${white * 2} / span 2; grid-row: 1`);
    }
    board.append(cap);
  });
  figure.append(board);
  return figure;
}

/**
 * One block -> a DOM node.
 * @param {object} context { keySources: { app, editor, instrument } }
 */
export function renderBlock(doc, block, context = {}) {
  switch (block.type) {
    case 'p': return withInline(doc, el(doc, 'p'), block.text);
    case 'h': return el(doc, 'h3', '', block.text);
    case 'ul':
    case 'ol': {
      const list = el(doc, block.type);
      for (const item of block.items) list.append(withInline(doc, el(doc, 'li'), item));
      return list;
    }
    case 'tip':
    case 'note': {
      const box = el(doc, 'div', `man-callout ${block.type}`);
      box.append(el(doc, 'strong', 'man-callout-label', block.type === 'tip' ? 'Tip' : 'Note'));
      box.append(withInline(doc, el(doc, 'p'), block.text));
      return box;
    }
    case 'table': {
      const wrap = el(doc, 'div', 'man-table-wrap');
      const table = el(doc, 'table', 'man-table');
      if (block.head) {
        const head = el(doc, 'thead');
        const row = el(doc, 'tr');
        for (const cell of block.head) row.append(withInline(doc, el(doc, 'th'), cell));
        head.append(row);
        table.append(head);
      }
      const body = el(doc, 'tbody');
      for (const cells of block.rows) {
        const row = el(doc, 'tr');
        for (const cell of cells) row.append(withInline(doc, el(doc, 'td'), cell));
        body.append(row);
      }
      table.append(body);
      wrap.append(table);
      return wrap;
    }
    case 'keys': return renderKeys(doc, block.rows ?? context.keySources?.[block.source] ?? []);
    case 'code': return el(doc, 'pre', 'man-code', block.text);
    case 'piano': {
      const box = el(doc, 'div', 'man-pianos');
      box.append(renderPianoRow(doc, 'Upper row: the octave above the current one', block.upper));
      box.append(renderPianoRow(doc, 'Lower row: the current octave', block.lower));
      return box;
    }
    default: throw new Error(`unknown manual block type "${block.type}"`);
  }
}

/** A section -> <section id> with a heading that is also a link to itself. `context.number` is shown before the title. */
export function renderSection(doc, section, context = {}) {
  const node = el(doc, 'section', 'man-section');
  node.setAttribute('id', section.id);
  const heading = el(doc, 'h2');
  if (context.number) heading.append(el(doc, 'span', 'man-num', `${context.number}. `));
  heading.append(doc.createTextNode(section.title));
  const anchor = el(doc, 'a', 'man-anchor', '#');
  anchor.setAttribute('href', `#${section.id}`);
  anchor.setAttribute('aria-label', `Link to ${section.title}`);
  heading.append(anchor);
  node.append(heading);
  for (const block of section.blocks) node.append(renderBlock(doc, block, context));
  return node;
}
