// Tests for the version module. Run: node --test web/version.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTOSAVE_KEY, DEV_AUTOSAVE_KEY, autosaveKeyFor, compareSemver, isDevChannel, parseSemver, pickRelease, siteRoot,
} from './version.js';

test('parseSemver accepts plain major.minor.patch only', () => {
  assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
  assert.equal(parseSemver('1.2'), null);
  assert.equal(parseSemver('v1.2.3'), null);
  assert.equal(parseSemver('1.2.3-rc1'), null);
});

test('compareSemver compares numbers, not text', () => {
  assert.ok(compareSemver('0.10.0', '0.9.0') > 0);
  assert.ok(compareSemver('0.1.0', '0.1.1') < 0);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
});

test('siteRoot strips the file and a release or dev folder', () => {
  for (const path of ['/WebSidTracker/tracker.html', '/WebSidTracker/v0.1.0/tracker.html', '/WebSidTracker/dev/', '/WebSidTracker/']) {
    assert.equal(siteRoot(path), '/WebSidTracker/', path);
  }
  assert.equal(siteRoot('/tracker.html'), '/');
  assert.equal(siteRoot('/'), '/');
});

test('isDevChannel and autosaveKeyFor tell the development copy apart', () => {
  assert.equal(isDevChannel('/WebSidTracker/dev/tracker.html'), true);
  assert.equal(isDevChannel('/WebSidTracker/tracker.html'), false);
  assert.equal(autosaveKeyFor('/WebSidTracker/dev/tracker.html'), DEV_AUTOSAVE_KEY);
  assert.equal(autosaveKeyFor('/WebSidTracker/v0.1.0/tracker.html'), AUTOSAVE_KEY);
});

test('pickRelease takes the newest release with the format', () => {
  const releases = [
    { release: '0.1.0', format: 1 },
    { release: '0.2.0', format: 1 },
    { release: '0.3.0', format: 2 },
  ];
  assert.equal(pickRelease(releases, 1).release, '0.2.0');
  assert.equal(pickRelease(releases, 3), null);
});
