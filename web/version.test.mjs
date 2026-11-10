// Tests for the version module. Run: node --test web/version.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  autosaveKeyFor, autosaveKeysFor, compareSemver, isDevChannel, parseSemver, pickRelease, siteRoot,
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

test('isDevChannel tells the development copy apart', () => {
  assert.equal(isDevChannel('/WebSidTracker/dev/tracker.html'), true);
  assert.equal(isDevChannel('/WebSidTracker/tracker.html'), false);
});

test('every format has its own autosave key, the development copy has its own set', () => {
  assert.equal(autosaveKeyFor('/WebSidTracker/tracker.html', 1), 'websidtracker.autosave.v1');
  assert.equal(autosaveKeyFor('/WebSidTracker/v0.2.0/tracker.html', 2), 'websidtracker.autosave.v2');
  assert.equal(autosaveKeyFor('/WebSidTracker/dev/tracker.html', 2), 'websidtracker.dev.autosave.v2');
});

test('autosaveKeysFor lists the own key first, then the keys of older formats', () => {
  assert.deepEqual(autosaveKeysFor('/x/tracker.html', 3), ['websidtracker.autosave.v3', 'websidtracker.autosave.v2', 'websidtracker.autosave.v1']);
  assert.deepEqual(autosaveKeysFor('/x/dev/tracker.html', 1), ['websidtracker.dev.autosave.v1']);
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

// ---- the stamps in the exports and in the player

import { readFileSync } from 'node:fs';
import { FORMAT, RELEASE } from './version.js';
import { demoProject } from './model/project.js';
import { exportInstrumentsAsm, exportSongAsm, projectToJson, versionLine } from './model/export.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const [MAJOR, MINOR, PATCH] = RELEASE.split('.').map(Number);

test('versionLine names the format and the release', () => {
  assert.equal(versionLine(), `; websidtracker format ${FORMAT}, release ${RELEASE}`);
});

test('the asm exports carry the version line as their second line', () => {
  const project = demoProject();
  assert.equal(exportInstrumentsAsm(project.instruments).split('\n')[1], versionLine());
  assert.equal(exportSongAsm(project.song, 'demo').split('\n')[1], versionLine());
});

test('the project file carries format and release', () => {
  const data = JSON.parse(projectToJson(demoProject()));
  assert.equal(data.version, FORMAT);
  assert.equal(data.release, RELEASE);
});

test('symbols.json carries the same numbers', () => {
  const symbols = JSON.parse(read('./player/symbols.json'));
  assert.equal(symbols.format_version, FORMAT);
  assert.deepEqual([symbols.release_major, symbols.release_minor, symbols.release_patch], [MAJOR, MINOR, PATCH]);
});

test('music.asm carries the same numbers', () => {
  const source = read('../src/music.asm');
  assert.ok(source.includes(`; websidtracker format ${FORMAT}, release ${RELEASE}`));
  for (const line of [`format_version = ${FORMAT}`, `release_major = ${MAJOR}`, `release_minor = ${MINOR}`, `release_patch = ${PATCH}`]) {
    assert.ok(new RegExp(`^${line.replace(/ /g, '\\s*')}\\b`, 'm').test(source), line);
  }
});
