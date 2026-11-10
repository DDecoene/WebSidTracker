// Tests for the autosave lock. Run: node --test web/app/autosave-lock.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutosaveLock } from './autosave-lock.js';

test('a new lock lets autosave through', () => {
  assert.equal(createAutosaveLock().blocked, false);
});

test('a kept lock blocks autosave until the person opens something', () => {
  const lock = createAutosaveLock();
  lock.set('kept');
  assert.equal(lock.blocked, true);
  lock.release();
  assert.equal(lock.blocked, false);
});

test('a newer lock is never released', () => {
  const lock = createAutosaveLock();
  lock.set('newer');
  lock.release();
  assert.equal(lock.blocked, true);
  assert.equal(lock.reason, 'newer');
});
