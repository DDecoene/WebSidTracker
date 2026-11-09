// Tests for the pure part of files.js. Run: node --test web/app/files.test.mjs
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { slug } from './files.js';

test('slug makes a safe name', () => {
  assert.equal(slug('My Song #2!'), 'my_song_2');
  assert.equal(slug('  --  '), 'song');
  assert.equal(slug('', 'x'), 'x');
  assert.equal(slug(undefined), 'song');
  assert.equal(slug('Åke'), 'ke');
});
