// panels.js - the small DOM pieces of the shell: the message strip, the manual dialog
// and the export dialog. They know nothing about the project; main.js feeds them.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { copyText, download } from './files.js';
import { renderSection, searchSections } from './manual-render.js';

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
     *   `onDismiss` runs when the person closes the message by Dismiss or by an action (not when the program clears it).
     */
    show(key, kind, title, lines = [], { dismissible = true, timeoutMs = 0, actions = [], onDismiss = null } = {}) {
      this.clear(key);
      const body = el('div', { class: 'body' }, el('strong', { text: title }));
      if (lines.length) body.append(el('ul', {}, ...lines.map((line) => el('li', { text: line }))));
      const box = el('div', { class: `message ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, body);
      for (const action of actions) {
        const button = el('button', { type: 'button', class: action.primary ? 'primary' : '', text: action.label });
        button.addEventListener('click', () => { this.clear(key); onDismiss?.(); action.run(); });
        box.append(button);
      }
      if (dismissible) {
        const close = el('button', { type: 'button', class: 'dismiss', 'aria-label': 'Dismiss', text: 'Dismiss' });
        close.addEventListener('click', () => { this.clear(key); onDismiss?.(); });
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

/**
 * The manual dialog: a section list on the left, one section at a time on the right, and a
 * search box. The text comes from manual.js and is built by manual-render.js (the same code as
 * the standalone manual.html page). While a search is active every matching section is shown.
 *
 * The dialog is modal (the page behind it is inert, so editor keys cannot fire), Esc closes it,
 * Tab stays inside it, and the focus goes back to where it was when it closes.
 *
 * @param {object} options
 * @param {HTMLDialogElement} options.dialog   the <dialog> with #manual-nav, #manual-content, #manual-search, #manual-close
 * @param {object[]} options.sections          the manual data
 * @param {() => Promise<object>} options.getKeySources   the key tables (see loadKeySources)
 * @param {() => HTMLElement|null} [options.fallbackFocus]   where the focus goes when the element that had it is gone
 * @returns {{ open: (sectionId?: string) => Promise<void>, close: () => void }}
 */
export function createManualDialog({ dialog, sections, getKeySources, fallbackFocus = null }) {
  const nav = dialog.querySelector('#manual-nav');
  const content = dialog.querySelector('#manual-content');
  const search = dialog.querySelector('#manual-search');
  const status = dialog.querySelector('#manual-status');
  const fullLink = dialog.querySelector('#manual-full');
  let current = sections[0].id;
  let keySources = null;
  let built = false;
  let returnTo = null;
  const sectionNodes = new Map();
  const navItems = new Map();

  function build() {
    sections.forEach((section, index) => {
      const node = renderSection(document, section, { keySources, number: index + 1 });
      node.hidden = true;
      // the heading's own "#" link is for the standalone page; inside the dialog it would only reload
      node.querySelector('.man-anchor')?.remove();
      sectionNodes.set(section.id, node);
      content.append(node);
      const item = el('li');
      const button = el('button', { type: 'button', class: 'md-nav-item', text: `${index + 1}. ${section.title}`, 'data-id': section.id });
      item.append(button);
      nav.append(item);
      navItems.set(section.id, item);
    });
    content.append(el('p', { id: 'manual-none', class: 'md-none', hidden: '', text: 'No section matches your search.' }));
    built = true;
  }

  function refresh() {
    const query = search.value;
    const matches = searchSections(sections, query, keySources);
    const searching = query.trim() !== '';
    if (!matches.includes(current) && matches.length > 0) current = matches[0];
    for (const section of sections) {
      const shown = searching ? matches.includes(section.id) : section.id === current;
      sectionNodes.get(section.id).hidden = !shown;
      navItems.get(section.id).hidden = !matches.includes(section.id);
      const button = navItems.get(section.id).firstChild;
      if (section.id === current) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    }
    content.classList.toggle('md-searching', searching);
    content.querySelector('#manual-none').hidden = matches.length > 0;
    status.textContent = searching ? `${matches.length} of ${sections.length} sections match.` : '';
    fullLink.setAttribute('href', `manual.html#${current}`);
  }

  function select(id, { scroll = true } = {}) {
    if (!sectionNodes.has(id)) return;
    current = id;
    refresh();
    if (scroll) {
      if (search.value.trim() !== '') sectionNodes.get(id).scrollIntoView({ block: 'start' });
      else content.scrollTop = 0;
    }
  }

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (button) select(button.dataset.id);
  });
  // links inside the text that point at another section ("#concepts")
  content.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    select(link.getAttribute('href').slice(1));
  });
  search.addEventListener('input', () => { refresh(); content.scrollTop = 0; });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && search.value !== '') {      // first Esc clears the search, the next closes
      event.preventDefault();
      event.stopPropagation();
      search.value = '';
      refresh();
    }
  });
  dialog.querySelector('#manual-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });   // the backdrop
  dialog.addEventListener('close', () => {
    const target = returnTo && document.contains(returnTo) ? returnTo : fallbackFocus?.();
    target?.focus();
    returnTo = null;
  });
  // keep Tab inside the dialog
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, a[href], input, [tabindex="0"]')].filter((node) => !node.closest('[hidden]') && !node.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return {
    async open(sectionId) {
      if (dialog.open) return;
      const active = document.activeElement;
      returnTo = active instanceof HTMLElement && active !== document.body ? active : null;
      if (!built) {
        keySources = await getKeySources();
        build();
      }
      if (sectionId && sectionNodes.has(sectionId)) current = sectionId;
      search.value = '';
      refresh();
      dialog.showModal();
      content.scrollTop = 0;
      navItems.get(current).firstChild.focus();
    },
    close() { if (dialog.open) dialog.close(); },
  };
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
