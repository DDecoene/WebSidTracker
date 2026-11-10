// Tests for the format check and the migration chain. Run: node --test web/model/migrate.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { FORMAT } from '../version.js';
import { newProject } from './project.js';
import { projectFromJson, projectToJson } from './export.js';
import { NewerFormatError, OlderFormatError } from './format.js';
import { inspectProject } from './migrate.js';

const textWith = (changes) => JSON.stringify({ ...JSON.parse(projectToJson(newProject())), ...changes });
const withoutVersion = () => {
  const data = JSON.parse(projectToJson(newProject()));
  delete data.version;
  return JSON.stringify(data);
};
const resetSpeed = (data) => ({ data: { ...data, song: { ...data.song, speed: 6 } }, losses: ['speed reset to 6'] });
const dropSecondVoice = (data) => ({ data, losses: ['voice 2 is not kept'] });

test('an older file is migrated and its losses are listed', () => {
  const text = textWith({ version: 1, song: { ...newProject().song, speed: 9 } });
  const info = inspectProject(text, { format: 2, migrations: [resetSpeed] });
  assert.equal(info.status, 'older');
  assert.equal(info.fromFormat, 1);
  assert.deepEqual(info.losses, ['speed reset to 6']);
  assert.equal(info.project.song.speed, 6);
  assert.deepEqual(info.problems, []);
});

test('a file of the current format opens as it is', () => {
  const info = inspectProject(textWith({ version: 2 }), { format: 2, migrations: [resetSpeed] });
  assert.equal(info.status, 'current');
  assert.equal(info.project.song.speed, newProject().song.speed);
});

test('a newer file is refused with its format', () => {
  assert.throws(() => inspectProject(textWith({ version: 3, release: '0.9.0' }), { format: 2, migrations: [resetSpeed] }),
    (error) => error instanceof NewerFormatError && error.format === 3 && error.release === '0.9.0');
});

test('a missing version means format 1', () => {
  const info = inspectProject(withoutVersion(), { format: 2, migrations: [resetSpeed] });
  assert.equal(info.status, 'older');
  assert.equal(info.fromFormat, 1);
});

test('a version that is not a positive whole number is not a project file', () => {
  for (const version of [0, -1, 1.5, '1', null]) {
    assert.throws(() => inspectProject(textWith({ version }), { format: 2, migrations: [resetSpeed] }), /not a project file/, String(version));
  }
});

test('a migration whose result is invalid gives no project and lists the problems', () => {
  const broken = (data) => ({ data: { ...data, song: { ...data.song, speed: 999 } }, losses: [] });
  const info = inspectProject(textWith({ version: 1 }), { format: 2, migrations: [broken] });
  assert.equal(info.status, 'older');
  assert.equal(info.project, null);
  assert.ok(info.problems.length > 0);
});

test('migrations run in order and their losses add up', () => {
  const info = inspectProject(textWith({ version: 1 }), { format: 3, migrations: [resetSpeed, dropSecondVoice] });
  assert.deepEqual(info.losses, ['speed reset to 6', 'voice 2 is not kept']);
});

test('text that is not json is not a project file', () => {
  assert.throws(() => inspectProject('{nope', { format: 1, migrations: [] }), /not valid JSON/);
});

test('projectFromJson opens the current format and refuses other formats', () => {
  assert.ok(projectFromJson(projectToJson(newProject())).song);
  assert.throws(() => projectFromJson(textWith({ version: FORMAT + 1 })), NewerFormatError);
  if (FORMAT > 1) assert.throws(() => projectFromJson(textWith({ version: FORMAT - 1 })), OlderFormatError);
});
