// Keyboard shortcuts: the default key for every action, plus the user's own
// changes (saved in localStorage). Everything that shows or handles a key —
// the shortcut handler, the button tooltips and the keybind editor — asks here.
//
// A key is written as a string: "C", "Shift+C", "Ctrl+O", "Space", "ArrowLeft", "?".

export const ACTION_GROUPS = [
  {
    name: 'View',
    actions: [
      { id: 'rotate', label: 'Rotate tool', key: 'R' },
      { id: 'pan', label: 'Pan tool', key: 'P' },
      { id: 'zoom', label: 'Zoom tool', key: 'Z' },
      { id: 'center', label: 'Center model', key: 'C' },
      { id: 'fit', label: 'Fit to view', key: 'F' },
    ],
  },
  {
    name: 'Display',
    actions: [
      { id: 'shaded', label: 'Shaded', key: null },
      { id: 'wireframe', label: 'Wireframe', key: 'W' },
      { id: 'edges', label: 'Shaded + edges', key: 'E' },
      { id: 'clay', label: 'Clay', key: 'Shift+C' },
      { id: 'grid', label: 'Grid', key: 'G' },
      { id: 'axes', label: 'Axes', key: null },
      { id: 'theme', label: 'Light / dark theme', key: null },
    ],
  },
  {
    name: 'Animation',
    actions: [{ id: 'playPause', label: 'Play / pause', key: 'Space' }],
  },
  {
    name: 'Files',
    actions: [
      { id: 'open', label: 'Open file', key: 'Ctrl+O' },
      { id: 'previousFile', label: 'Previous file in folder', key: 'ArrowLeft' },
      { id: 'nextFile', label: 'Next file in folder', key: 'ArrowRight' },
      { id: 'screenshot', label: 'Save screenshot', key: null },
    ],
  },
  {
    name: 'App',
    actions: [{ id: 'keybinds', label: 'Keyboard shortcuts', key: '?' }],
  },
];

const ACTIONS = ACTION_GROUPS.flatMap((g) => g.actions);
const DEFAULTS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.key]));
const STORAGE_KEY = 'lighter.keymap';

let bindings = { ...DEFAULTS };
const listeners = [];

load();

function load() {
  bindings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const [id, key] of Object.entries(saved)) {
      if (id in DEFAULTS) bindings[id] = key;
    }
  } catch {
    /* nothing saved, or storage unavailable: defaults */
  }
}

function save() {
  // Only store what differs from the defaults, so improved defaults in a
  // later version still reach everyone who didn't change that key.
  const changed = Object.fromEntries(Object.entries(bindings).filter(([id, key]) => key !== DEFAULTS[id]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    /* not critical */
  }
  listeners.forEach((cb) => cb());
}

export const keymap = {
  /** Current key of an action, or null. */
  get: (id) => bindings[id] ?? null,

  label: (id) => ACTIONS.find((a) => a.id === id)?.label ?? id,

  /** Which action a key triggers, or null. */
  actionFor: (key) => ACTIONS.find((a) => bindings[a.id] === key)?.id ?? null,

  /**
   * Give `id` a new key (null = no key). If another action had that key, the
   * two swap: the other action takes `id`'s old key. Returns what moved, as
   * { id, key }, or null.
   */
  set(id, key) {
    const old = bindings[id];
    const other = key ? keymap.actionFor(key) : null;
    let moved = null;
    if (other && other !== id) {
      bindings[other] = old;
      moved = { id: other, key: old };
    }
    bindings[id] = key;
    save();
    return moved;
  },

  reset() {
    bindings = { ...DEFAULTS };
    save();
  },

  isDefault: () => ACTIONS.every((a) => bindings[a.id] === DEFAULTS[a.id]),

  onChange: (cb) => listeners.push(cb),
};

/** Turn a keydown event into a key string, or null for a lone modifier key. */
export function keyFromEvent(e) {
  let key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(key)) return null;
  if (key === ' ') key = 'Space';
  const isLetter = key.length === 1 && key.toLowerCase() !== key.toUpperCase();
  if (key.length === 1) key = key.toUpperCase();

  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  // Shift counts for letters and named keys (Shift+C, Shift+Space). For
  // symbols like "?" it's just how the character is typed, so it's left out.
  if (e.shiftKey && (isLetter || key.length > 1)) mods.push('Shift');
  return [...mods, key].join('+');
}

const PRETTY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };

/** Key string for display: "ArrowLeft" → "←". Empty string for no key. */
export function displayKey(key) {
  if (!key) return '';
  return key
    .split('+')
    .map((part) => PRETTY[part] ?? part)
    .join('+');
}
