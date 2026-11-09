// Checks the demo registry: unique ids, and every demo builds a valid, lint-free project that fits.
//
// Run: node --test web/model/demos/index.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEMOS, findDemo, demoLabel } from './index.js';
import { lint, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

test('six demos, Ode to Joy first, ids unique', () => {
  assert.equal(DEMOS.length, 6);
  assert.equal(DEMOS[0].id, 'ode-to-joy');
  assert.equal(new Set(DEMOS.map((d) => d.id)).size, DEMOS.length);
  assert.equal(findDemo('original').title, 'Original demo tune');
  assert.equal(findDemo('nope'), undefined);
});

for (const demo of DEMOS) {
  test(`${demo.id}: complete info, valid, lint-free, within limits`, () => {
    assert.ok(demo.title && demo.composer && demo.note);
    const project = demo.build();
    assert.deepEqual(validate(project), []);
    assert.deepEqual(lint(project), []);
    assert.equal(songSizeInfo(project).fits, true);
    const { bytes } = serialiseSong(project.song, 0x3000);
    assert.ok(0x3000 + bytes.length <= 0xC000);
    assert.equal(parseSong(bytes, 0x3000).orders.length, 3);
  });
}

test('build gives a fresh project each time', () => {
  assert.notEqual(DEMOS[0].build(), DEMOS[0].build());
});

test('demoLabel joins title and composer', () => {
  assert.equal(demoLabel({ title: 'A', composer: 'B' }), 'A - B');
});
