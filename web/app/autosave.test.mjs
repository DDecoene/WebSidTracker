// Tests for finding the autosave. Run: node --test web/app/autosave.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { newProject } from '../model/project.js';
import { projectToJson } from '../model/export.js';
import { readAutosave } from './autosave.js';

const text = (version) => JSON.stringify({ ...JSON.parse(projectToJson(newProject())), version });
const storageWith = (items) => ({ getItem: (key) => (key in items ? items[key] : null) });
const keep = (data) => ({ data, losses: ['kept nothing'] });
const options = { format: 2, migrations: [keep] };
const PAGE = '/WebSidTracker/tracker.html';

test('nothing saved gives none', () => {
  assert.equal(readAutosave(storageWith({}), PAGE, options).kind, 'none');
});

test('a project of the own format is the autosave', () => {
  const found = readAutosave(storageWith({ 'websidtracker.autosave.v2': text(2) }), PAGE, options);
  assert.equal(found.kind, 'project');
  assert.ok(found.project.song);
});

test('the own key wins over the key of an older format', () => {
  const items = { 'websidtracker.autosave.v2': text(2), 'websidtracker.autosave.v1': text(1) };
  assert.equal(readAutosave(storageWith(items), PAGE, options).kind, 'project');
});

test('only an older key gives an older autosave to ask about', () => {
  const found = readAutosave(storageWith({ 'websidtracker.autosave.v1': text(1) }), PAGE, options);
  assert.equal(found.kind, 'older');
  assert.equal(found.info.fromFormat, 1);
  assert.equal(found.text, text(1));
});

test('keys of newer formats are never read', () => {
  const found = readAutosave(storageWith({ 'websidtracker.autosave.v2': text(2) }), PAGE, { format: 1, migrations: [] });
  assert.equal(found.kind, 'none');
});

test('a damaged own autosave falls back to an older one', () => {
  const items = { 'websidtracker.autosave.v2': '{nope', 'websidtracker.autosave.v1': text(1) };
  assert.equal(readAutosave(storageWith(items), PAGE, options).kind, 'older');
});

test('the development copy reads its own keys only', () => {
  const items = { 'websidtracker.autosave.v2': text(2) };
  assert.equal(readAutosave(storageWith(items), '/WebSidTracker/dev/tracker.html', options).kind, 'none');
  assert.equal(readAutosave(storageWith({ 'websidtracker.dev.autosave.v2': text(2) }), '/WebSidTracker/dev/tracker.html', options).kind, 'project');
});

test('blocked storage gives none', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); } };
  assert.equal(readAutosave(blocked, PAGE, options).kind, 'none');
});
