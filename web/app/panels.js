// panels.js - the small DOM pieces of the shell: the message strip, the help dialog
// and the export dialog. They know nothing about the project; main.js feeds them.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { copyText, download } from './files.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/**
 * The strip under the header. Messages have a key, so a new message with the same key
 * replaces the old one (the list of problems is updated, not stacked).
 */
export function createMessages(container) {
  const shown = new Map();
  return {
    /**
     * @param {string} key
     * @param {'error'|'warn'|'info'} kind
     * @param {string} title
     * @param {string[]} [lines]   shown as a list under the title
     * @param {{dismissible?: boolean, timeoutMs?: number, actions?: {label: string, run: () => void, primary?: boolean}[]}} [options]
     *   `actions` are buttons in the message (an inline question); a click runs the action and closes the message.
     */
    show(key, kind, title, lines = [], { dismissible = true, timeoutMs = 0, actions = [] } = {}) {
      this.clear(key);
      const body = el('div', { class: 'body' }, el('strong', { text: title }));
      if (lines.length) body.append(el('ul', {}, ...lines.map((line) => el('li', { text: line }))));
      const box = el('div', { class: `message ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, body);
      for (const action of actions) {
        const button = el('button', { type: 'button', class: action.primary ? 'primary' : '', text: action.label });
        button.addEventListener('click', () => { this.clear(key); action.run(); });
        box.append(button);
      }
      if (dismissible) {
        const close = el('button', { type: 'button', class: 'dismiss', 'aria-label': 'Dismiss', text: 'Dismiss' });
        close.addEventListener('click', () => this.clear(key));
        box.append(close);
      }
      container.append(box);
      const timer = timeoutMs ? setTimeout(() => this.clear(key), timeoutMs) : null;
      shown.set(key, { box, timer });
    },
    clear(key) {
      const entry = shown.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.box.remove();
      shown.delete(key);
    },
  };
}

/** Fill the help dialog. `sections` = [{ title, keys: [[key, description], ...] }]. */
export function renderHelp(body, sections) {
  body.replaceChildren();
  body.append(el('p', { class: 'hint', text: 'Edits are live: change a note or an instrument while the song plays and you hear it at once.' }));
  for (const section of sections) {
    body.append(el('h3', { text: section.title }));
    const list = el('dl', { class: 'keys' });
    for (const [key, description] of section.keys) {
      list.append(el('dt', {}, ...splitKeys(key)), el('dd', { text: description }));
    }
    body.append(list);
  }
}

// "Ctrl+Z / Cmd+Z" -> <kbd>Ctrl+Z</kbd> / <kbd>Cmd+Z</kbd>
function splitKeys(text) {
  const parts = String(text).split(' / ');
  const nodes = [];
  parts.forEach((part, index) => {
    if (index > 0) nodes.push(document.createTextNode(' / '));
    nodes.push(el('kbd', { text: part }));
  });
  return nodes;
}

/**
 * Fill the export dialog. `files` = [{ name, data (string | Uint8Array), what, text: bool, mime }].
 * Text files get a preview and a copy button.
 */
export function renderExport(body, files, notify) {
  body.replaceChildren();
  for (const file of files) {
    const size = file.data.length;
    const row = el('div', { class: 'file-row' },
      el('span', { class: 'name', text: file.name }),
      el('span', { class: 'size', text: `${size} bytes` }),
      el('span', { class: 'spacer' }));

    const save = el('button', { type: 'button', text: 'Download' });
    save.addEventListener('click', () => download(file.name, file.data, file.mime));
    row.append(save);

    if (file.text) {
      const preview = el('pre', { class: 'file-preview', text: file.data });
      preview.hidden = true;
      const show = el('button', { type: 'button', 'aria-expanded': 'false', text: 'Show' });
      show.addEventListener('click', () => {
        preview.hidden = !preview.hidden;
        show.textContent = preview.hidden ? 'Show' : 'Hide';
        show.setAttribute('aria-expanded', String(!preview.hidden));
      });
      const copy = el('button', { type: 'button', text: 'Copy' });
      copy.addEventListener('click', async () => {
        const ok = await copyText(file.data);
        notify(ok ? `${file.name} copied` : 'Copying was refused by the browser. Use Show and select the text.');
      });
      row.append(show, copy);
      row.append(el('span', { class: 'what', text: file.what }), preview);
    } else {
      row.append(el('span', { class: 'what', text: file.what }));
    }
    body.append(row);
  }
}
