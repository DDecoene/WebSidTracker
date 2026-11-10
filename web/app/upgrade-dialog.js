// upgrade-dialog.js - shows the "older project file" dialog and says what the person chose.
// The text and the choices come from describeUpgrade (upgrade.js).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

/**
 * @param {HTMLDialogElement} dialog  the #upgrade-dialog of tracker.html
 * @param description  the result of describeUpgrade
 * @returns {Promise<'port' | 'old' | 'cancel'>}  closing the dialog with Escape counts as 'cancel'
 */
export function askUpgrade(dialog, description) {
  const part = (id) => dialog.querySelector(`#${id}`);
  part('upgrade-title').textContent = description.heading;
  part('upgrade-summary').textContent = description.summary;

  const losses = part('upgrade-losses');
  losses.replaceChildren(...(description.losses.length > 0 ? description.losses : ['Nothing is lost.']).map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));

  const reasons = [description.port, description.old].filter((choice) => !choice.enabled).map((choice) => choice.reason);
  part('upgrade-reasons').replaceChildren(...reasons.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));

  const port = part('upgrade-port');
  const old = part('upgrade-old');
  port.textContent = 'Port to this version';
  port.disabled = !description.port.enabled;
  old.textContent = description.old.release ? `Open in the old tracker (release ${description.old.release})` : 'Open in the old tracker';
  old.disabled = !description.old.enabled;

  return new Promise((resolve) => {
    let choice = 'cancel';
    const finish = (value) => () => { choice = value; dialog.close(); };
    port.onclick = finish('port');
    old.onclick = finish('old');
    part('upgrade-cancel').onclick = finish('cancel');
    dialog.addEventListener('close', () => resolve(choice), { once: true });
    dialog.showModal();
  });
}
