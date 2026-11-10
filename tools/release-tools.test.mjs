// Tests for the release tooling. Run: node --test tools/release-tools.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assemble, buildReleasesJson, checkTag, parseVersionJs, releaseTags } from './release-tools.mjs';

const realVersionJs = readFileSync(new URL('../web/version.js', import.meta.url), 'utf8');

test('parseVersionJs reads FORMAT and RELEASE', () => {
  const { format, release } = parseVersionJs(realVersionJs);
  assert.ok(Number.isInteger(format) && format >= 1);
  assert.match(release, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(parseVersionJs("export const FORMAT = 3;\nexport const RELEASE = '1.2.3';\n"), { format: 3, release: '1.2.3' });
  assert.throws(() => parseVersionJs('nothing here'), /FORMAT/);
});

test('releaseTags keeps plain release tags, oldest first', () => {
  assert.deepEqual(releaseTags(['v0.2.0', 'v0.1.0', 'v0.1.0-rc1', 'latest', 'v0.10.0']), ['v0.1.0', 'v0.2.0', 'v0.10.0']);
});

test('buildReleasesJson lists the newest first', () => {
  const body = JSON.parse(buildReleasesJson([{ release: '0.1.0', format: 1 }, { release: '0.2.0', format: 2 }]));
  assert.deepEqual(body.releases, [{ release: '0.2.0', format: 2 }, { release: '0.1.0', format: 1 }]);
  assert.ok(buildReleasesJson([]).endsWith('\n'));
});

test('checkTag demands that the tag is v plus the release', () => {
  checkTag('v0.1.0', '0.1.0');
  assert.throws(() => checkTag('v0.2.0', '0.1.0'), /v0\.2\.0.*0\.1\.0/);
});

test('assemble builds the site from the tags and the development ref', () => {
  const repo = mkdtempSync(join(tmpdir(), 'wst-repo-'));
  const out = join(mkdtempSync(join(tmpdir(), 'wst-out-')), 'site');
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', 'version.js'), "export const FORMAT = 1;\nexport const RELEASE = '0.1.0';\n");
  writeFileSync(join(repo, 'web', 'page.txt'), 'release one');
  git('add', '.');
  git('commit', '-q', '-m', 'one');
  git('tag', 'v0.1.0');
  writeFileSync(join(repo, 'web', 'page.txt'), 'work in progress');
  git('commit', '-q', '-am', 'two');

  assemble(out, { cwd: repo, devRef: 'develop' });

  assert.equal(readFileSync(join(out, 'v0.1.0', 'page.txt'), 'utf8'), 'release one');
  assert.equal(readFileSync(join(out, 'page.txt'), 'utf8'), 'release one');       // the root is the newest release
  assert.equal(readFileSync(join(out, 'dev', 'page.txt'), 'utf8'), 'work in progress');
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'releases.json'), 'utf8')).releases, [{ release: '0.1.0', format: 1 }]);
});

test('without tags the root is the development ref', () => {
  const repo = mkdtempSync(join(tmpdir(), 'wst-repo-'));
  const out = join(mkdtempSync(join(tmpdir(), 'wst-out-')), 'site');
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', 'page.txt'), 'only develop');
  git('add', '.');
  git('commit', '-q', '-m', 'one');
  assemble(out, { cwd: repo, devRef: 'develop' });
  assert.equal(readFileSync(join(out, 'page.txt'), 'utf8'), 'only develop');
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'releases.json'), 'utf8')).releases, []);
  assert.equal(existsSync(join(out, 'dev', 'page.txt')), true);
});

test('a tag whose version.js names another release is left out of the site', () => {
  const repo = mkdtempSync(join(tmpdir(), 'wst-repo-'));
  const out = join(mkdtempSync(join(tmpdir(), 'wst-out-')), 'site');
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', 'version.js'), "export const FORMAT = 1;\nexport const RELEASE = '0.1.0';\n");
  writeFileSync(join(repo, 'web', 'page.txt'), 'release one');
  git('add', '.');
  git('commit', '-q', '-m', 'one');
  git('tag', 'v0.1.0');
  writeFileSync(join(repo, 'web', 'page.txt'), 'forgot to bump RELEASE');
  git('commit', '-q', '-am', 'two');
  git('tag', 'v0.2.0');

  const entries = assemble(out, { cwd: repo, devRef: 'develop' });

  assert.deepEqual(entries, [{ format: 1, release: '0.1.0' }]);
  assert.equal(readFileSync(join(out, 'v0.1.0', 'page.txt'), 'utf8'), 'release one');
  assert.equal(existsSync(join(out, 'v0.2.0')), false);
  assert.equal(readFileSync(join(out, 'page.txt'), 'utf8'), 'release one');
});
