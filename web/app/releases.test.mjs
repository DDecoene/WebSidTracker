// Tests for the release lookup. Run: node --test web/app/releases.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { frozenUrl, loadReleases } from './releases.js';

const respond = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 404, json: async () => body });

test('loadReleases reads the list from releases.json in the site root', async () => {
  let asked;
  const list = [{ release: '0.1.0', format: 1 }];
  const fetchFn = async (url) => { asked = url; return respond({ releases: list })(); };
  assert.deepEqual(await loadReleases('/WebSidTracker/', fetchFn), list);
  assert.equal(asked, '/WebSidTracker/releases.json');
});

test('loadReleases gives null when anything goes wrong', async () => {
  assert.equal(await loadReleases('/', respond({}, false)), null);
  assert.equal(await loadReleases('/', respond({ releases: 'x' })), null);
  assert.equal(await loadReleases('/', respond({ releases: [{ release: '0.1.0' }] })), null);
  assert.equal(await loadReleases('/', respond({ releases: [{ release: 'latest', format: 1 }] })), null);
  assert.equal(await loadReleases('/', async () => { throw new Error('offline'); }), null);
  assert.equal(await loadReleases('/', async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })), null);
});

test('frozenUrl points into the folder of a release', () => {
  assert.equal(frozenUrl('/WebSidTracker/', '0.1.0'), '/WebSidTracker/v0.1.0/tracker.html');
  assert.equal(frozenUrl('/', '0.2.0', 'manual.html'), '/v0.2.0/manual.html');
});
