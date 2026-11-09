// deeplink.js - what the address of the tracker page asks for.
//
//   tracker.html?demo=fur-elise     load that demo song at start
//   tracker.html?help=1             open the manual at start
//   tracker.html?help=instruments   open the manual at that section
//
// Pure, so it runs in Node for the tests.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/**
 * @param {string} search  location.search, for example "?demo=toccata&help=1"
 * @returns {{ demo: string|null, help: string|null }}
 *   `demo` is the requested demo id (not checked here), `help` is null when the manual
 *   was not asked for, '' for the first section, or a section id.
 */
export function parseDeepLink(search) {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { demo: null, help: null };
  }
  const demo = (params.get('demo') ?? '').trim();
  let help = null;
  if (params.has('help')) {
    const value = params.get('help').trim().toLowerCase();
    help = ['', '1', 'true', 'yes'].includes(value) ? '' : value;
  }
  return { demo: demo || null, help };
}
