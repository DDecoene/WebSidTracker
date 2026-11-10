// Tests for handing a project file to another release. Run: node --test web/app/handover.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { HANDOVER_KEY } from '../version.js';
import { putHandover, takeHandover } from './handover.js';

function fakeStorage(overrides = {}) {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
    ...overrides,
  };
}

test('a handed-over text is taken once and the key is gone afterwards', () => {
  const storage = fakeStorage();
  assert.equal(putHandover(storage, '{"a":1}'), true);
  assert.equal(takeHandover(storage), '{"a":1}');
  assert.equal(takeHandover(storage), null);
  assert.equal(storage.items.has(HANDOVER_KEY), false);
});

test('an empty text is removed as well', () => {
  const storage = fakeStorage();
  storage.setItem(HANDOVER_KEY, '');
  takeHandover(storage);
  assert.equal(storage.items.has(HANDOVER_KEY), false);
});

test('nothing to take gives null', () => {
  assert.equal(takeHandover(fakeStorage()), null);
});

test('blocked storage does not crash', () => {
  const blocked = () => { throw new Error('blocked'); };
  assert.equal(putHandover(fakeStorage({ setItem: blocked }), 'x'), false);
  assert.equal(takeHandover(fakeStorage({ getItem: blocked })), null);
});
