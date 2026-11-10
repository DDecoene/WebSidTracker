// Tests for the text and choices of the "older project file" dialog. Run: node --test web/app/upgrade.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeUpgrade } from './upgrade.js';

const info = { fromFormat: 1, release: '0.1.0', losses: ['instrument 5: field X is no longer used'], problems: [], project: {} };
const env = { currentFormat: 2, currentRelease: '0.3.0', oldRelease: '0.2.0', canHandOver: true };

test('losses and both formats are shown', () => {
  const d = describeUpgrade(info, env);
  assert.deepEqual(d.losses, info.losses);
  assert.match(d.summary, /format 1/);
  assert.match(d.summary, /format 2/);
  assert.match(d.summary, /0\.1\.0/);
  assert.equal(d.port.enabled, true);
  assert.equal(d.old.enabled, true);
  assert.equal(d.old.release, '0.2.0');
});

test('without a valid migrated project, porting is unavailable and the problems are given', () => {
  const d = describeUpgrade({ ...info, project: null, problems: ['pattern 3 is too long'] }, env);
  assert.equal(d.port.enabled, false);
  assert.match(d.port.reason, /pattern 3 is too long/);
  assert.deepEqual(d.problems, ['pattern 3 is too long']);
  assert.equal(d.old.enabled, true);
});

test('without a known release for the format, the old tracker is unavailable', () => {
  const d = describeUpgrade(info, { ...env, oldRelease: null });
  assert.equal(d.old.enabled, false);
  assert.match(d.old.reason, /release/);
  assert.equal(d.port.enabled, true);
});

test('blocked storage makes the old tracker unavailable, with the reason', () => {
  const d = describeUpgrade(info, { ...env, canHandOver: false });
  assert.equal(d.old.enabled, false);
  assert.match(d.old.reason, /storage/);
});

test('a file that does not say which release wrote it is still described', () => {
  const d = describeUpgrade({ ...info, release: null }, env);
  assert.match(d.summary, /format 1/);
});

test('porting a file from disk says the file is not changed', () => {
  const d = describeUpgrade(info, { ...env, source: 'file' });
  assert.match(d.note, /not changed/);
  assert.equal(d.saveOriginal, false);
});

test('porting the project saved in the browser first saves the original as a file', () => {
  const d = describeUpgrade(info, { ...env, source: 'autosave' });
  assert.match(d.note, /only in this browser/);
  assert.equal(d.saveOriginal, true);
});

test('a portable file lists what is lost, or says nothing is', () => {
  assert.deepEqual(describeUpgrade(info, env).lossLines, info.losses);
  assert.equal(describeUpgrade(info, env).lossHeading, 'What would be lost or changed');
  assert.deepEqual(describeUpgrade({ ...info, losses: [] }, env).lossLines, ['Nothing is lost.']);
});

test('a file that cannot be ported lists the problems instead of "Nothing is lost."', () => {
  const d = describeUpgrade({ ...info, losses: [], project: null, problems: ['pattern 3 is too long'] }, env);
  assert.equal(d.lossHeading, 'Why the file cannot be ported');
  assert.deepEqual(d.lossLines, ['pattern 3 is too long']);
});
