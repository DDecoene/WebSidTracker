// Golden-file tests: they stop a change of the formats from going unnoticed.
// Run: node --test web/model/golden.test.mjs
//
// A golden set is what the current code makes of one fixed example project. If the code makes
// something different, a format changed: raise FORMAT in web/version.js, add a migration and a new set
// (node web/model/golden/make.mjs <n>), or undo the change. See docs/releasing.md.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { FORMAT } from '../version.js';
import { defaultInstrument, validate } from './project.js';
import { serialiseSong } from './serialise.js';
import { exportInstrumentsAsm, exportSongAsm, projectToJson } from './export.js';
import { inspectProject } from './migrate.js';
import { formatFingerprint } from './fingerprint.js';
import { goldenProject } from './golden/example.js';

const golden = (n, file) => new URL(`./golden/format-${n}/${file}`, import.meta.url);
const text = (url) => readFileSync(url, 'utf8');
// A release bump must not fail the test: the release number is replaced by a fixed one on both sides.
const noRelease = (value) => value.replace(/release \d+\.\d+\.\d+/g, 'release 0.0.0').replace(/"release": "\d+\.\d+\.\d+"/g, '"release": "0.0.0"');
const HELP = 'the format changed: raise FORMAT in web/version.js, add a migration and a new golden set (node web/model/golden/make.mjs <n>), or undo the change';
const symbols = JSON.parse(text(new URL('../player/symbols.json', import.meta.url)));

test('the example project is valid and uses every instrument field', () => {
  const project = goldenProject();
  assert.deepEqual(validate(project), []);
  for (const key of Object.keys(defaultInstrument())) {
    assert.ok(project.instruments.some((inst) => inst && inst[key] !== defaultInstrument()[key]), `no instrument sets ${key}`);
  }
  const types = new Set(project.song.patterns.flatMap((p) => p.events.map((e) => e.type)));
  assert.deepEqual([...types].sort(), ['inst', 'legato', 'note', 'rest']);
});

test(`the golden set of format ${FORMAT} exists`, () => {
  assert.ok(existsSync(golden(FORMAT, 'project.json')), `run: node web/model/golden/make.mjs ${FORMAT}`);
});

test('the project file matches the golden file', () => {
  assert.equal(noRelease(projectToJson(goldenProject())), noRelease(text(golden(FORMAT, 'project.json'))), HELP);
});

test('instruments.asm matches the golden file', () => {
  assert.equal(noRelease(exportInstrumentsAsm(goldenProject().instruments)), noRelease(text(golden(FORMAT, 'instruments.asm'))), HELP);
});

test('song_golden.asm matches the golden file', () => {
  assert.equal(noRelease(exportSongAsm(goldenProject().song, 'golden')), noRelease(text(golden(FORMAT, 'song_golden.asm'))), HELP);
});

test('the serialised song bytes match the golden file', () => {
  const expected = new Uint8Array(readFileSync(golden(FORMAT, 'song.bin')));
  assert.deepEqual(new Uint8Array(serialiseSong(goldenProject().song, 0x3000).bytes), expected, HELP);
});

test('the player fingerprint matches the golden file', () => {
  assert.equal(formatFingerprint(symbols), text(golden(FORMAT, 'fingerprint.txt')).trim(), HELP);
});

test('the fingerprint changes when the state block layout changes', () => {
  const moved = { ...symbols, st_pat_pos: symbols.st_pat_pos + 1 };
  assert.notEqual(formatFingerprint(moved), formatFingerprint(symbols));
});

test('the fingerprint does not change when the player code only moves', () => {
  const shifted = Object.fromEntries(Object.entries(symbols).map(([name, address]) => [name, /^(st_(?!voice_size)|music_|play_voice|vibrato|multiply|divide|freq_)/.test(name) ? address + 16 : address]));
  assert.equal(formatFingerprint(shifted), formatFingerprint(symbols));
});

test('every older golden set still loads through the migrations to the example project', () => {
  const dirs = readdirSync(new URL('./golden/', import.meta.url)).filter((d) => /^format-\d+$/.test(d));
  for (const dir of dirs) {
    const n = Number(dir.slice('format-'.length));
    if (n >= FORMAT) continue;
    const info = inspectProject(text(golden(n, 'project.json')));
    assert.equal(info.status, 'older', dir);
    assert.ok(info.project, `${dir}: ${info.problems.join('; ')}`);
  }
});
