// migrate.js - bringing a project file of an older format to the current one.
//
// MIGRATIONS[n - 1] takes the data of format n to format n + 1. Each returns the new data and a list
// of what the step could not keep, in plain words. inspectProject runs the whole chain in memory
// (a dry run: nothing is saved) so the tracker can show the losses before the person decides.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { FORMAT } from '../version.js';
import { NewerFormatError, readFormat } from './format.js';
import { checkProjectShape, parseProjectText, projectFromData } from './export.js';

/**
 * Format 1 to 2: the arpeggio got a second offset (instrument field `arp2`, table inst_arp2). A format 1
 * instrument has a two-note arpeggio, and that is what arp2 = 0 means, so every instrument gets 0 and
 * sounds as it did. Nothing is lost.
 */
function addSecondArpeggioOffset(data) {
  const instruments = Array.isArray(data.instruments)
    ? data.instruments.map((inst) => (inst && typeof inst === 'object' ? { ...inst, arp2: 0 } : inst))
    : data.instruments;
  return { data: { ...data, version: 2, instruments }, losses: [] };
}

/** @type {Array<(data: object) => { data: object, losses: string[] }>} */
export const MIGRATIONS = [addSecondArpeggioOffset];

/**
 * @param {string} text  the project file
 * @returns {{status: 'current', project: object}
 *   | {status: 'older', fromFormat: number, release: string|null, project: object|null, losses: string[], problems: string[]}}
 *   `project` is null, and `problems` says why, when the migrated data is not a valid project.
 * @throws {NewerFormatError} when the file is newer than `format`; Error when it is not a project file
 */
export function inspectProject(text, { format = FORMAT, migrations = MIGRATIONS } = {}) {
  let data = parseProjectText(text);
  const fromFormat = readFormat(data);
  const release = typeof data.release === 'string' ? data.release : null;
  if (fromFormat > format) throw new NewerFormatError(fromFormat, release);
  checkProjectShape(data);
  if (fromFormat === format) return { status: 'current', project: projectFromData(data) };

  const losses = [];
  for (let n = fromFormat; n < format; n++) {
    const step = migrations[n - 1];
    if (!step) throw new Error(`There is no migration from format ${n} to ${n + 1}.`);
    const result = step(data);
    data = result.data;
    losses.push(...result.losses);
  }
  try {
    return { status: 'older', fromFormat, release, project: projectFromData(data), losses, problems: [] };
  } catch (error) {
    return { status: 'older', fromFormat, release, project: null, losses, problems: [error.message] };
  }
}
