// files.js - small helpers for saving and opening files in the browser.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/** A name safe for a file name and an assembler label: lower case letters, digits, underscore. */
export function slug(name, fallback = 'song') {
  const text = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return text || fallback;
}

/** Offer `data` (string or bytes) as a download. */
export function download(fileName, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** The text of a File chosen in an <input type="file">. */
export function readText(file) {
  return file.text();
}

/** Copy text to the clipboard. Returns false if the browser says no. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
