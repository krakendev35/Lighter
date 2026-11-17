// Keybind editor: a panel listing every action and its key. Click a key, then
// press the new one. Esc cancels, Backspace / Delete removes the key. A key
// that another action already uses swaps with it (see keymap.set).
import { ACTION_GROUPS, keymap, keyFromEvent, displayKey } from './keymap.js';

const HELP = 'Click a key to change it · Esc cancels · Backspace clears';

/** Build the panel inside `root`; returns { open, close, isOpen }. */
export function setupKeybindEditor(root) {
  root.innerHTML = `
    <div class="kb-panel" role="dialog" aria-modal="true" aria-labelledby="kb-title">
      <header>
        <h2 id="kb-title">Keyboard shortcuts</h2>
        <button type="button" class="icon-btn" id="kb-close" aria-label="Close (Esc)" title="Close (Esc)">
          <svg viewBox="0 0 18 18" width="18" height="18"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>
        </button>
      </header>
      <div class="kb-list">
        ${ACTION_GROUPS.map(
          (g) => `
          <h3>${g.name}</h3>
          ${g.actions
            .map(
              (a) => `
            <div class="kb-row">
              <span>${a.label}</span>
              <button type="button" class="kb-key" data-id="${a.id}"></button>
            </div>`,
            )
            .join('')}`,
        ).join('')}
      </div>
      <footer>
        <span id="kb-note"></span>
        <button type="button" class="outline-btn" id="kb-reset">Reset to defaults</button>
      </footer>
    </div>`;

  const note = root.querySelector('#kb-note');
  const resetBtn = root.querySelector('#kb-reset');
  const keyButtons = [...root.querySelectorAll('.kb-key')];
  let capturing = null; // action id waiting for a key

  function render() {
    for (const btn of keyButtons) {
      const id = btn.dataset.id;
      const waiting = id === capturing;
      btn.classList.toggle('active', waiting);
      btn.classList.toggle('unset', !waiting && !keymap.get(id));
      btn.textContent = waiting ? 'Press a key…' : displayKey(keymap.get(id)) || 'none';
    }
    resetBtn.disabled = keymap.isDefault();
  }

  function startCapture(id) {
    capturing = id;
    note.textContent = `Press the new key for “${keymap.label(id)}”`;
    render();
  }

  function stopCapture(message = HELP) {
    capturing = null;
    note.textContent = message;
    render();
  }

  keyButtons.forEach((btn) => btn.addEventListener('click', () => startCapture(btn.dataset.id)));
  resetBtn.addEventListener('click', () => {
    keymap.reset();
    stopCapture('All keys are back to their defaults');
  });
  root.querySelector('#kb-close').addEventListener('click', close);
  // Clicking the dimmed area outside the panel closes it.
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });

  // Runs before the app's own shortcut handler (capture phase), so while the
  // panel is open no shortcut fires.
  window.addEventListener(
    'keydown',
    (e) => {
      if (root.hidden) return;
      if (!capturing) {
        if (e.key === 'Escape') close();
        // Let Tab / Enter work for moving around the panel; swallow the rest.
        if (e.key !== 'Tab' && e.key !== 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') return stopCapture();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const id = capturing;
        keymap.set(id, null);
        return stopCapture(`“${keymap.label(id)}” has no key now`);
      }
      const key = keyFromEvent(e);
      if (!key) return; // a modifier on its own: wait for the real key

      const id = capturing;
      const moved = keymap.set(id, key);
      stopCapture(
        moved
          ? `${displayKey(key)} was used by “${keymap.label(moved.id)}”, which now has ${displayKey(moved.key) || 'no key'}`
          : `“${keymap.label(id)}” is now ${displayKey(key)}`,
      );
    },
    { capture: true },
  );

  function open() {
    root.hidden = false;
    stopCapture();
    root.querySelector('#kb-close').focus();
  }

  function close() {
    capturing = null;
    root.hidden = true;
  }

  return { open, close, isOpen: () => !root.hidden };
}
