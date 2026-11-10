// version.js - the two version numbers of WebSidTracker and the small helpers around them.
//
// FORMAT is the format version: one whole number for the project json, song_<name>.asm,
// instruments.asm and the player. It rises only when one of those formats changes, and never falls.
// RELEASE is the release version (major.minor.patch) of this copy of the tracker.
// See docs/design-versioning-and-releases.md.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see LICENSE).

export const FORMAT = 1;
export const RELEASE = '0.1.0';

/** sessionStorage key used to hand a project file to another release of the tracker. */
export const HANDOVER_KEY = 'websidtracker.handover';
/** localStorage key of the autosave; the same in every release, so releases see each other's autosave. */
export const AUTOSAVE_KEY = 'websidtracker.autosave.v1';
/** The development copy has its own autosave, so it cannot overwrite the autosave of a release. */
export const DEV_AUTOSAVE_KEY = 'websidtracker.dev.autosave';

/** @returns {[number, number, number] | null} the parts of a plain "major.minor.patch", else null */
export function parseSemver(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(text));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Negative when a is older than b, positive when newer, 0 when equal. */
export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) throw new Error(`not a release version: ${left ? b : a}`);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/**
 * The folder that holds releases.json and the release folders: the page path without its file name
 * and without a "v<release>" or "dev" folder in front of it. Always ends in "/".
 */
export function siteRoot(pathname) {
  const parts = String(pathname).split('/');
  parts.pop();                                   // the file name, or '' for a path that ends in "/"
  const last = parts[parts.length - 1];
  if (last === 'dev' || /^v\d+\.\d+\.\d+$/.test(last)) parts.pop();
  return parts.join('/') + '/';
}

export function isDevChannel(pathname) {
  const parts = String(pathname).split('/');
  parts.pop();
  return parts[parts.length - 1] === 'dev';
}

export function autosaveKeyFor(pathname) {
  return isDevChannel(pathname) ? DEV_AUTOSAVE_KEY : AUTOSAVE_KEY;
}

/**
 * @param {{release: string, format: number}[]} releases
 * @returns the newest release with that format, or null
 */
export function pickRelease(releases, format) {
  let best = null;
  for (const entry of releases) {
    if (entry.format !== format) continue;
    if (!best || compareSemver(entry.release, best.release) > 0) best = entry;
  }
  return best;
}
