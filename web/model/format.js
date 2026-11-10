// format.js - reading the format version of a project file, and the errors for a file that does not match.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/** The file was written by a newer tracker than this one. */
export class NewerFormatError extends Error {
  constructor(format, release = null) {
    super(`This project file has format ${format}${release ? ` (written by release ${release})` : ''}, which is newer than this tracker understands. Open it in a newer release of WebSidTracker.`);
    this.name = 'NewerFormatError';
    this.format = format;
    this.release = release;
  }
}

/** The file is older than this tracker and has to go through the migrations first. */
export class OlderFormatError extends Error {
  constructor(format) {
    super(`This project file has the older format ${format} and has to be ported first.`);
    this.name = 'OlderFormatError';
    this.format = format;
  }
}

/**
 * The format version of parsed project data. A file without a version is format 1: the field has been
 * written since the first export. Anything else than a positive whole number is not a project file.
 */
export function readFormat(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This is not a project file (not an object).');
  if (data.version === undefined) return 1;
  if (!Number.isInteger(data.version) || data.version < 1) throw new Error('This is not a project file (bad version).');
  return data.version;
}
