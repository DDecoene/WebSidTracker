// Tests for the manual data, its renderer, the search and the deep-link parser. No browser:
// the renderer gets a tiny stand-in for `document`.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTIONS, APP_KEYS, findSection, loadKeySources } from './manual.js';
import {
  parseInline, plainText, isSafeHref, keyCaps, searchSections, sectionText, renderBlock, renderSection, renderInline,
} from './manual-render.js';
import { parseDeepLink } from './deeplink.js';
import { pianoSemitone, keyHelp } from '../ui/editor-logic.js';
import { instrumentKeyHelp } from '../ui/instruments.js';
import { DEMOS } from '../model/demos/index.js';

// ---- a minimal DOM: elements remember their children, text and attributes -------------------

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this._text = ''; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  get lastChild() { return this.children[this.children.length - 1]; }
}
class TextNode { constructor(text) { this.tag = '#text'; this._text = text; this.children = []; } get textContent() { return this._text; } }
const doc = { createElement: (tag) => new Node(tag), createTextNode: (text) => new TextNode(text) };

function allNodes(node, out = []) {
  out.push(node);
  for (const child of node.children) allNodes(child, out);
  return out;
}

// ---- the data ---------------------------------------------------------------------------------

test('every section has an id, a title and blocks; ids are unique and usable as anchors', () => {
  assert.ok(SECTIONS.length >= 10);
  const ids = new Set();
  for (const section of SECTIONS) {
    assert.match(section.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(section.title.trim().length > 0, `${section.id} needs a title`);
    assert.ok(section.blocks.length > 0, `${section.id} has no blocks`);
    assert.ok(!ids.has(section.id), `duplicate id ${section.id}`);
    ids.add(section.id);
  }
  assert.equal(findSection('quick-start').title, 'Quick start');
  assert.equal(findSection('nope'), undefined);
});

test('no block is empty and every block can be rendered', () => {
  for (const section of SECTIONS) {
    for (const block of section.blocks) {
      const hasContent = Boolean(block.text?.trim()) || Boolean(block.items?.length) || Boolean(block.rows?.length)
        || Boolean(block.source) || block.type === 'piano';
      assert.ok(hasContent, `empty block in ${section.id}: ${JSON.stringify(block).slice(0, 60)}`);
      const node = renderBlock(doc, block, { keySources: { app: APP_KEYS, editor: [['a', 'b']], instrument: [['c', 'd']] } });
      assert.ok(node.tag);
    }
    assert.equal(renderSection(doc, section).attrs.id, section.id);
  }
  assert.throws(() => renderBlock(doc, { type: 'marquee' }), /unknown manual block/);
});

test('every in-page link points at a real section', () => {
  const ids = new Set(SECTIONS.map((section) => section.id));
  const texts = JSON.stringify(SECTIONS);
  for (const match of texts.matchAll(/\]\(#([\w-]+)\)/g)) assert.ok(ids.has(match[1]), `link to #${match[1]}`);
});

test('every table row has as many cells as its header', () => {
  for (const section of SECTIONS) {
    for (const block of section.blocks.filter((b) => b.type === 'table')) {
      for (const row of block.rows) assert.equal(row.length, block.head.length, `${section.id}: ${row[0]}`);
    }
  }
});

test('the piano diagram uses the same keys as the editor', () => {
  const piano = SECTIONS.flatMap((s) => s.blocks).find((b) => b.type === 'piano');
  [...piano.lower].forEach((key, i) => assert.equal(pianoSemitone(key), i));
  [...piano.upper].forEach((key, i) => assert.equal(pianoSemitone(key), 12 + i));
});

test('the code listings keep the player calls of docs/player.md', () => {
  const text = SECTIONS.flatMap((s) => s.blocks).filter((b) => b.type === 'code').map((b) => b.text).join('\n');
  for (const name of ['music_init', 'music_play', 'music_stop']) assert.ok(text.includes(name));
});

test('the key sources come from the editor and the instrument panel', async () => {
  const sources = await loadKeySources();
  assert.deepEqual(sources.editor, keyHelp());
  assert.deepEqual(sources.instrument, instrumentKeyHelp());
  assert.deepEqual(sources.app, APP_KEYS);
  const keys = SECTIONS.find((s) => s.id === 'shortcuts').blocks.filter((b) => b.type === 'keys').map((b) => b.source);
  assert.deepEqual(keys, ['app', 'editor', 'instrument']);
});

test('the demo ids named in the manual exist', () => {
  assert.equal(DEMOS.length, 6);   // the manual says "six songs"
});

// ---- inline markup and safety -------------------------------------------------------------------

test('parseInline understands the small markup', () => {
  assert.deepEqual(parseInline('a **b** *c* `d` [[E]] [f](#g) h'), [
    { t: 'text', text: 'a ' }, { t: 'b', text: 'b' }, { t: 'text', text: ' ' }, { t: 'i', text: 'c' },
    { t: 'text', text: ' ' }, { t: 'code', text: 'd' }, { t: 'text', text: ' ' }, { t: 'kbd', text: 'E' },
    { t: 'text', text: ' ' }, { t: 'a', text: 'f', href: '#g' }, { t: 'text', text: ' h' },
  ]);
  assert.equal(plainText('Press [[Space]] to **play** it'), 'Press Space to play it');
  assert.deepEqual(parseInline(''), []);
});

test('only safe link targets become links', () => {
  for (const ok of ['#faq', 'https://example.org/a?b=1', 'manual.html', 'manual.html#faq', 'tracker.html?demo=toccata']) assert.ok(isSafeHref(ok), ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example', ' https://x', 'https://x" onclick="y']) assert.ok(!isSafeHref(bad), bad);
  assert.ok(parseInline('[click](javascript:alert(1))').every((token) => token.t === 'text'));
});

test('markup in text never becomes elements: it stays text', () => {
  const nasty = '<img src=x onerror=alert(1)> <script>alert(1)</script> **bold** [x](javascript:alert(1))';
  const nodes = renderInline(doc, nasty);
  const wrapper = new Node('p');
  wrapper.append(...nodes);
  const tags = allNodes(wrapper).map((node) => node.tag);
  assert.deepEqual([...new Set(tags)].sort(), ['#text', 'p', 'strong']);
  assert.ok(wrapper.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(wrapper.textContent.includes('<script>'));
  const block = renderBlock(doc, { type: 'ul', items: ['<b>x</b>'] });
  assert.ok(allNodes(block).every((node) => node.tag !== 'b'));
  assert.equal(block.textContent, '<b>x</b>');
  const keys = renderBlock(doc, { type: 'keys', rows: [['<i>', '<u>y</u>']] });
  assert.ok(allNodes(keys).every((node) => !['i', 'u'].includes(node.tag)));
});

test('external links open safely in a new tab', () => {
  const link = renderInline(doc, '[x](https://example.org)')[0];
  assert.equal(link.attrs.target, '_blank');
  assert.equal(link.attrs.rel, 'noopener');
  assert.equal(renderInline(doc, '[x](#a)')[0].attrs.target, undefined);
});

// ---- key caps ---------------------------------------------------------------------------------------

const capText = (text) => keyCaps(text).map((p) => (p.cap ? `<${p.text}>` : p.text)).join('');

test('keyCaps splits key texts into caps and plain separators', () => {
  assert.equal(capText('z s x d'), '<z> <s> <x> <d>');
  assert.equal(capText('Ctrl+Z / Cmd+Z'), '<Ctrl+Z> / <Cmd+Z>');
  assert.equal(capText('9 / 0'), '<9> / <0>');
  assert.equal(capText('Up / Down, PageUp / PageDown'), '<Up> / <Down>, <PageUp> / <PageDown>');
  assert.equal(capText('Order list: s, l, p'), 'Order list: <s>, <l>, <p>');
  assert.equal(capText('Delete or .'), '<Delete> or <.>');
  assert.equal(capText('?'), '<?>');
  assert.equal(capText('< and >  (or F1 / F2)'), '<<> and <>> (or <F1> / <F2>)');
  assert.equal(capText(";  and  '"), "<;> and <'>");
});

test('keyCaps copes with every real key text and loses no characters', () => {
  for (const [keys] of [...keyHelp(), ...instrumentKeyHelp(), ...APP_KEYS]) {
    const parts = keyCaps(keys);
    assert.ok(parts.some((p) => p.cap), keys);
    const squeeze = (text) => text.replace(/[\s()]/g, '');
    assert.equal(squeeze(parts.map((p) => p.text).join('')), squeeze(keys), keys);
  }
});

// ---- search --------------------------------------------------------------------------------------------

test('search matches every word, in any case, and keeps the manual order', () => {
  const all = SECTIONS.map((s) => s.id);
  assert.deepEqual(searchSections(SECTIONS, ''), all);
  assert.deepEqual(searchSections(SECTIONS, '   '), all);
  assert.deepEqual(searchSections(SECTIONS, 'zzzzqqqq'), []);
  assert.ok(searchSections(SECTIONS, 'ARPEGGIO').includes('instruments'));
  assert.ok(searchSections(SECTIONS, 'local storage').includes('faq'));
  const both = searchSections(SECTIONS, 'release frames');
  assert.ok(both.includes('instruments') && both.includes('faq'));
  const narrow = searchSections(SECTIONS, 'release frames zzzz');
  assert.deepEqual(narrow, []);
  const ordered = searchSections(SECTIONS, 'the');
  assert.deepEqual(ordered, all.filter((id) => ordered.includes(id)));
});

test('search looks into the generated key tables too', () => {
  const sources = { app: APP_KEYS, editor: keyHelp(), instrument: instrumentKeyHelp() };
  assert.ok(searchSections(SECTIONS, 'legato marker on / off', sources).includes('shortcuts'));
  assert.ok(!searchSections(SECTIONS, 'legato marker on / off').includes('shortcuts'));
  assert.ok(sectionText(findSection('shortcuts'), sources).includes('redo'));
});

// ---- deep links -------------------------------------------------------------------------------------------

test('parseDeepLink reads demo and help', () => {
  assert.deepEqual(parseDeepLink(''), { demo: null, help: null });
  assert.deepEqual(parseDeepLink('?demo=toccata'), { demo: 'toccata', help: null });
  assert.deepEqual(parseDeepLink('?help=1'), { demo: null, help: '' });
  assert.deepEqual(parseDeepLink('?help'), { demo: null, help: '' });
  assert.deepEqual(parseDeepLink('?help=Instruments'), { demo: null, help: 'instruments' });
  assert.deepEqual(parseDeepLink('?demo=%20fur-elise%20&help=true'), { demo: 'fur-elise', help: '' });
  assert.deepEqual(parseDeepLink('?demo='), { demo: null, help: null });
  assert.deepEqual(parseDeepLink('?other=1'), { demo: null, help: null });
});
