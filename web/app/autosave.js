// autosave.js - finding the project this browser has saved.
//
// Every format has its own key (see autosaveKeyFor in version.js). A tracker looks at its own key first and
// then at the keys of older formats; keys of newer formats are not its business.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { autosaveKeysFor } from '../version.js';
import { inspectProject } from '../model/migrate.js';

/**
 * @param storage  anything with getItem (localStorage)
 * @param {string} pathname  location.pathname, to tell the development copy apart
 * @param {{format?: number, migrations?: Array}} [options]  passed to inspectProject (tests inject them)
 * @returns {{kind: 'none'}
 *   | {kind: 'project', project: object}
 *   | {kind: 'older', info: object, text: string}}
 *   'older' is the autosave of an older format, to ask about; a damaged save counts as nothing.
 */
export function readAutosave(storage, pathname, options = {}) {
  for (const key of autosaveKeysFor(pathname, options.format)) {
    let text = null;
    try {
      text = storage.getItem(key);
    } catch {
      return { kind: 'none' };               // blocked storage: start from the first-start demo
    }
    if (!text) continue;
    try {
      const info = inspectProject(text, options);
      return info.status === 'current' ? { kind: 'project', project: info.project } : { kind: 'older', info, text };
    } catch {
      // damaged, or from a newer format than the key says: look at the next key
    }
  }
  return { kind: 'none' };
}
