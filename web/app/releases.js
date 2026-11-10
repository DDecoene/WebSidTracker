// releases.js - which releases of the tracker exist, from releases.json in the root of the site.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { parseSemver } from '../version.js';

/** @param {string} root  the site root, ending in "/" (see siteRoot in version.js)
 *  @returns {Promise<{release: string, format: number}[] | null>} null when the list cannot be had */
export async function loadReleases(root, fetchFn = fetch) {
  try {
    const response = await fetchFn(`${root}releases.json`);
    if (!response.ok) return null;
    const body = await response.json();
    const list = body && body.releases;
    if (!Array.isArray(list)) return null;
    if (!list.every((entry) => entry && parseSemver(entry.release) !== null && Number.isInteger(entry.format))) return null;
    return list;
  } catch {
    return null;
  }
}

/** The address of a page inside the frozen copy of a release. */
export function frozenUrl(root, release, file = 'tracker.html') {
  return `${root}v${release}/${file}`;
}
