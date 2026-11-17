// Guide: a side panel on the right listing the mouse controls and every
// shortcut, toggled with ? or the top-bar button. The keys come from the
// keymap, so the guide always shows the user's own bindings. Whether it is
// open is remembered between runs.
import { keymap, displayKey } from './keymap.js';

const STORAGE_KEY = 'lighter.guide';

// Rows of the guide. A row with `ids` shows those actions' keys and is left
// out when none of them has a key; a row with `mouse` is a fixed gesture.
const SECTIONS = [
  {
    name: 'Mouse',
    rows: [
      { mouse: 'Left-drag', text: 'Rotate (or the selected tool)' },
      { mouse: 'Right-drag', text: 'Pan' },
      { mouse: 'Scroll', text: 'Zoom' },
      { mouse: 'Click cube', text: 'Look from a side' },
    ],
  },
  {
    name: 'View',
    rows: [
      { ids: ['rotate', 'pan', 'zoom'], text: 'Rotate / pan / zoom tool' },
      { ids: ['center'], text: 'Center model' },
      { ids: ['fit'], text: 'Fit to view' },
    ],
  },
  {
    name: 'Display',
    rows: [
      { ids: ['shaded'], text: 'Shaded' },
      { ids: ['wireframe'], text: 'Wireframe' },
      { ids: ['edges'], text: 'Shaded + edges' },
      { ids: ['clay'], text: 'Clay' },
      { ids: ['grid'], text: 'Grid' },
      { ids: ['axes'], text: 'Axes' },
      { ids: ['theme'], text: 'Light / dark theme' },
    ],
  },
  {
    name: 'Animation',
    animOnly: true,
    rows: [{ ids: ['playPause'], text: 'Play / pause' }],
  },
  {
    name: 'Files',
    rows: [
      { ids: ['open'], text: 'Open file' },
      { ids: ['previousFile', 'nextFile'], text: 'Previous / next file' },
      { ids: ['screenshot'], text: 'Save screenshot' },
    ],
  },
];

const escapeHtml = (s) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const chip = (text) => `<kbd>${escapeHtml(text)}</kbd>`;

/**
 * Build the panel in `root`. `onCustomize` opens the keybind editor;
 * `onChange(open)` runs whenever the panel opens or closes.
 */
export function setupGuide(root, { onCustomize, onChange }) {
  root.innerHTML = `
    <header>
      <h2>Guide</h2>
      <button type="button" class="icon-btn" id="guide-close">
        <svg viewBox="0 0 18 18" width="18" height="18"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>
      </button>
    </header>
    <div class="guide-list"></div>
    <footer>
      <span id="guide-toggle-note"></span>
      <button type="button" class="outline-btn" id="guide-customize">Customize keys</button>
    </footer>`;

  const list = root.querySelector('.guide-list');
  const closeBtn = root.querySelector('#guide-close');
  const note = root.querySelector('#guide-toggle-note');

  function render() {
    list.innerHTML = SECTIONS.map((section) => {
      const rows = section.rows
        .map((row) => {
          const keys = row.mouse
            ? [row.mouse]
            : row.ids.map((id) => displayKey(keymap.get(id))).filter(Boolean);
          if (!keys.length) return '';
          return `<div class="guide-row"><span>${row.text}</span><span class="keys">${keys.map(chip).join('')}</span></div>`;
        })
        .join('');
      if (!rows) return '';
      return `<section class="${section.animOnly ? 'anim-only' : ''}"><h3>${section.name}</h3>${rows}</section>`;
    }).join('');

    const key = displayKey(keymap.get('guide'));
    note.innerHTML = key ? `${chip(key)} toggles the guide` : '';
    const title = key ? `Hide guide (${key})` : 'Hide guide';
    closeBtn.title = title;
    closeBtn.setAttribute('aria-label', title);
  }

  // The panel stays in the page and slides (theme.css); `inert` keeps the
  // closed one out of reach of the mouse, Tab and screen readers.
  const isOpen = () => document.body.classList.contains('guide-open');

  function setOpen(open, notify = true) {
    root.inert = !open;
    document.body.classList.toggle('guide-open', open);
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
    } catch {
      /* not critical */
    }
    if (notify) onChange?.(open);
  }

  closeBtn.addEventListener('click', () => setOpen(false));
  root.querySelector('#guide-customize').addEventListener('click', () => onCustomize?.());
  keymap.onChange(render);
  render();

  let startOpen = false;
  try {
    startOpen = localStorage.getItem(STORAGE_KEY) === 'open';
  } catch {
    /* closed */
  }
  setOpen(startOpen, false); // restoring at start-up: the toolbar reads isOpen() itself

  return {
    toggle: () => setOpen(!isOpen()),
    isOpen,
  };
}
