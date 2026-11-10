// release-tools.mjs - what the Pages workflow needs to publish releases (MIT licence, see ../LICENSE).
//
//   node tools/release-tools.mjs check-tag <tag>                 fails unless <tag> is v<RELEASE of web/version.js>
//   node tools/release-tools.mjs assemble <outDir> [--dev-ref R]  builds the whole site from the release tags
//
// The site: the newest release in <outDir>/, every release in <outDir>/v<release>/, the development
// branch (R, default origin/develop) in <outDir>/dev/, and <outDir>/releases.json. With no release tags
// yet, the root is the development ref. See docs/design-versioning-and-releases.md, section 7.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareSemver, parseSemver } from '../web/version.js';

/** @returns {{format: number, release: string}} read from the text of web/version.js */
export function parseVersionJs(text) {
  const format = /export const FORMAT = (\d+);/.exec(text);
  const release = /export const RELEASE = '(\d+\.\d+\.\d+)';/.exec(text);
  if (!format) throw new Error('web/version.js has no "export const FORMAT = n;"');
  if (!release) throw new Error("web/version.js has no \"export const RELEASE = 'x.y.z';\"");
  return { format: Number(format[1]), release: release[1] };
}

/** Only plain vX.Y.Z tags are releases; oldest first. */
export function releaseTags(tags) {
  return tags
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag) && parseSemver(tag.slice(1)))
    .sort((a, b) => compareSemver(a.slice(1), b.slice(1)));
}

/** @param {{release: string, format: number}[]} entries @returns {string} releases.json, newest first */
export function buildReleasesJson(entries) {
  const sorted = [...entries].sort((a, b) => compareSemver(b.release, a.release));
  return JSON.stringify({ releases: sorted.map(({ release, format }) => ({ release, format })) }, null, 1) + '\n';
}

export function checkTag(tag, release) {
  if (tag !== `v${release}`) throw new Error(`The tag is ${tag} but web/version.js says release ${release}: expected the tag v${release}.`);
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });

/** Copies the web/ folder of a git ref into destination. */
function exportWeb(cwd, ref, destination) {
  const scratch = mkdtempSync(join(tmpdir(), 'wst-export-'));
  try {
    execFileSync('tar', ['-x', '-C', scratch], { input: git(cwd, 'archive', ref, 'web') });
    mkdirSync(destination, { recursive: true });
    cpSync(join(scratch, 'web'), destination, { recursive: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function refExists(cwd, ref) {
  try {
    git(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** Builds the whole site in outDir from the release tags of the repository in cwd. */
export function assemble(outDir, { cwd = process.cwd(), devRef = 'origin/develop' } = {}) {
  const tags = releaseTags(git(cwd, 'tag', '--list', 'v*').toString().split('\n').map((t) => t.trim()).filter(Boolean));
  const entries = [];
  let newestTag = null;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const tag of tags) {
    const info = parseVersionJs(git(cwd, 'show', `${tag}:web/version.js`).toString());
    if (tag !== `v${info.release}`) {
      console.warn(`Skipping ${tag}: web/version.js at that tag says release ${info.release}.`);
      continue;
    }
    exportWeb(cwd, tag, join(outDir, `v${info.release}`));
    entries.push(info);
    newestTag = tag;
  }
  const hasDev = refExists(cwd, devRef);
  if (newestTag) {
    exportWeb(cwd, newestTag, outDir);
  } else if (hasDev) {
    exportWeb(cwd, devRef, outDir);
  } else {
    throw new Error(`There is no release tag and no ${devRef}: nothing to publish.`);
  }
  if (hasDev) exportWeb(cwd, devRef, join(outDir, 'dev'));
  writeFileSync(join(outDir, 'releases.json'), buildReleasesJson(entries));
  return entries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'check-tag' && args[0]) {
      const { release } = parseVersionJs(readFileSync(new URL('../web/version.js', import.meta.url), 'utf8'));
      checkTag(args[0], release);
      console.log(`tag ${args[0]} matches release ${release}`);
    } else if (command === 'assemble' && args[0]) {
      const at = args.indexOf('--dev-ref');
      const entries = assemble(args[0], at >= 0 ? { devRef: args[at + 1] } : {});
      console.log(`site written to ${args[0]}: ${entries.length} release(s)`);
    } else {
      console.error('usage: release-tools.mjs check-tag <tag> | assemble <outDir> [--dev-ref <ref>]');
      process.exit(2);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
