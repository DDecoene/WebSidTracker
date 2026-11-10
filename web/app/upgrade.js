// upgrade.js - the words and the choices of the dialog that opens when a project file is older than
// the tracker. Pure, so it runs in Node for the tests; upgrade-dialog.js shows it.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/**
 * @param {{fromFormat: number, release: string|null, losses: string[], problems: string[], project: object|null}} info
 *   what inspectProject returned for an older file
 * @param {{currentFormat: number, currentRelease: string, oldRelease: string|null, canHandOver: boolean}} env
 *   `oldRelease` is the newest release with the file's format (null if none is known),
 *   `canHandOver` says whether the browser lets the page hand the file to another page.
 */
export function describeUpgrade(info, env) {
  const writer = info.release ? ` (written by release ${info.release})` : '';
  const summary = `This project file has format ${info.fromFormat}${writer}. This tracker (release ${env.currentRelease}) uses format ${env.currentFormat}.`;

  const port = info.project
    ? { enabled: true, reason: null }
    : { enabled: false, reason: `The file cannot be ported: ${info.problems.join('; ')}` };

  let old;
  if (!env.oldRelease) {
    old = { enabled: false, reason: 'No release with this format is known, or the list of releases could not be loaded.', release: null };
  } else if (!env.canHandOver) {
    old = { enabled: false, reason: 'The browser blocks storage, so the file cannot be handed to the old tracker.', release: env.oldRelease };
  } else {
    old = { enabled: true, reason: null, release: env.oldRelease };
  }

  return {
    heading: 'This project file is older than the tracker',
    summary,
    losses: info.losses,
    problems: info.problems,
    port,
    old,
  };
}
