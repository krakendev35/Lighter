// App start and file-open handling.
import { Viewer } from './viewer.js';
import { ViewCube } from './viewcube.js';
import { loadModel, makeResolver, extensionOf, SUPPORTED } from './loaders.js';
import { setupTopbar, setupPlayer, setupAutoHide, setFileInfo, setupShortcuts, setupStartHint } from './ui.js';
import { setupKeybindEditor } from './keybinds.js';
import { setupGuide } from './guide.js';

const IN_TAURI = !!window.__TAURI_INTERNALS__;

const viewer = new Viewer(document.getElementById('viewport'));
const viewCube = new ViewCube(viewer, document.body);

const fileInput = document.getElementById('file-input');
const keybindEditor = setupKeybindEditor(document.getElementById('keybinds'));
setupStartHint(document.getElementById('start-hint'));
const guide = setupGuide(document.getElementById('guide'), {
  onCustomize: () => keybindEditor.open(),
  onChange: () => refreshButtons(), // the ? button shows pressed while open
});

/* ---------------- Opening files ---------------- */

// What is open right now: `path` in the desktop app; in the plain browser,
// the dropped models (for ← →) and the resolver for their textures.
const current = { name: null, path: null, browserModels: [], browserResolve: null };

// Each load gets a number; when several overlap (holding → for example),
// only the newest one is shown.
let loadCounter = 0;

/**
 * Show a model from raw bytes + its file name.
 * `resolve` finds the textures / .mtl / .bin files the model refers to.
 */
async function showModel(buffer, name, resolve = null, path = null) {
  const format = extensionOf(name);
  if (!SUPPORTED.includes(format)) {
    console.warn(`Unsupported file: ${name}`);
    return;
  }
  const loadId = ++loadCounter;
  try {
    const { object, animations } = await loadModel(buffer, name, resolve);
    if (loadId !== loadCounter) return; // a newer file was opened meanwhile
    viewer.setModel(object, animations);
    Object.assign(current, { name, path });
    document.body.classList.add('has-model');
    setFileInfo(name, viewer.stats(), { format, bytes: buffer.byteLength });
    setWindowTitle(`${name} — Lighter`);
    resetPlayer();
  } catch (err) {
    console.error(err);
  }
}

const isModel = (name) => SUPPORTED.includes(extensionOf(name));
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

/**
 * Open browser File objects (plain-browser drop / file picker). The first
 * model is shown; the other files (textures, .mtl, .bin) are available to it,
 * and ← → step through all dropped models.
 */
let blobUrls = [];
async function openFiles(files) {
  const models = files.filter((f) => isModel(f.name)).sort((a, b) => naturalOrder(a.name, b.name));
  if (!models.length) return;

  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls = [];
  const byName = new Map(files.map((f) => [f.name, f]));
  const resolve = makeResolver([...byName.keys()], (name) => {
    const url = URL.createObjectURL(byName.get(name));
    blobUrls.push(url);
    return url;
  });
  current.browserModels = models;
  current.browserResolve = resolve;
  openBrowserModel(models[0]);
}

async function openBrowserModel(file) {
  showModel(await file.arrayBuffer(), file.name, current.browserResolve);
}

/** Open a file by its path on disk (desktop app only). */
async function openPath(path) {
  try {
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
    const dir = path.replace(/[\\/][^\\/]*$/, '');
    let resolve = null;
    try {
      const files = await invoke('index_folder', { modelPath: path });
      resolve = makeResolver(files, (rel) => convertFileSrc(`${dir}\\${rel.replace(/\//g, '\\')}`));
    } catch (err) {
      console.warn('Textures next to the model are unavailable:', err);
    }
    const buffer = await invoke('read_file', { path });
    showModel(buffer, path.split(/[\\/]/).pop(), resolve, path);
  } catch (err) {
    console.error(err);
  }
}

/** ← → : open the previous / next model in the same folder (wraps around). */
async function stepFile(delta) {
  if (!current.name) return;

  if (!IN_TAURI) {
    const list = current.browserModels;
    if (list.length < 2) return;
    const i = list.findIndex((f) => f.name === current.name);
    openBrowserModel(list[(i + delta + list.length) % list.length]);
    return;
  }

  // Desktop: list the folder fresh each time, so new/deleted files are noticed.
  const { invoke } = await import('@tauri-apps/api/core');
  const dir = current.path.replace(/[\\/][^\\/]*$/, '');
  const names = (await invoke('list_folder', { path: current.path })).filter(isModel).sort(naturalOrder);
  if (names.length < 2) return;
  const i = names.findIndex((n) => n.toLowerCase() === current.name.toLowerCase());
  openPath(`${dir}\\${names[(i + delta + names.length) % names.length]}`);
}

/** Save the current view as a PNG (3D view only, no UI). */
async function saveScreenshot() {
  if (!current.name) return;
  const blob = await viewer.screenshot();
  const fileName = `${current.name.replace(/\.[^.]+$/, '')}.png`;

  if (!IN_TAURI) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }

  // Desktop: native Save dialog, starting in the model's folder.
  const { save } = await import('@tauri-apps/plugin-dialog');
  const dir = current.path.replace(/[\\/][^\\/]*$/, '');
  const target = await save({
    defaultPath: `${dir}\\${fileName}`,
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (!target) return;
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
}

/** Several paths dropped at once: open the first model among them. */
function openPaths(paths) {
  const model = paths.find(isModel);
  if (model) openPath(model);
}

async function setWindowTitle(title) {
  document.title = title;
  // In the desktop app also set the native window title.
  if (IN_TAURI) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().setTitle(title);
  }
}

// Ctrl+O / "Open file" button. The desktop app uses the native Windows
// dialog (it gives a real path, so textures next to the model can be found);
// the plain browser uses a file input where the model and its textures can
// be selected together.
async function pickFile() {
  if (!IN_TAURI) return fileInput.click();
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({
    multiple: false,
    filters: [{ name: '3D models', extensions: SUPPORTED }],
  });
  if (path) openPath(path);
}
document.getElementById('open-btn').addEventListener('click', pickFile);
fileInput.addEventListener('change', () => {
  openFiles([...fileInput.files]);
  fileInput.value = '';
});

/* ---------------- Theme ---------------- */

function loadSavedTheme() {
  try {
    return localStorage.getItem('lighter.theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

async function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  try {
    localStorage.setItem('lighter.theme', name);
  } catch {
    /* not critical */
  }
  viewer.setTheme(name);
  viewCube.setTheme(name);
  // Match the native Windows title bar.
  if (IN_TAURI) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().setTheme(name);
  }
}

applyTheme(loadSavedTheme());

/* ---------------- Controls ---------------- */

const toggleMode = (mode) => viewer.setMode(viewer.mode === mode ? 'shaded' : mode);

/** Rotate / Pan / Zoom tool: what left-drag does (cursor changes to match). */
function setTool(tool) {
  viewer.setTool(tool);
  document.body.dataset.tool = tool;
}

let refreshButtons = () => {};
const withRefresh = (fn) => () => {
  fn();
  refreshButtons();
};

const actions = {
  open: pickFile,
  shaded: withRefresh(() => viewer.setMode('shaded')),
  // Button and key both toggle: a second press goes back to shaded.
  wireframe: withRefresh(() => toggleMode('wireframe')),
  edges: withRefresh(() => toggleMode('edges')),
  clay: withRefresh(() => viewer.toggleClay()),
  grid: withRefresh(() => viewer.toggleGrid()),
  axes: withRefresh(() => viewer.toggleAxes()),
  theme: withRefresh(() => applyTheme(viewer.theme === 'dark' ? 'light' : 'dark')),
  fit: () => viewer.frame({ keepDirection: true, animate: true }),
  center: () => viewer.centerModel(),
  rotate: withRefresh(() => setTool('rotate')),
  pan: withRefresh(() => setTool('pan')),
  zoom: withRefresh(() => setTool('zoom')),
  screenshot: () => saveScreenshot().catch((err) => console.error('Screenshot failed:', err)),
  playPause: () => viewer.player?.toggle(),
  guide: () => guide.toggle(),
  keybinds: () => keybindEditor.open(),
  previousFile: () => stepFile(-1).catch(console.error),
  nextFile: () => stepFile(1).catch(console.error),
};

const isActive = (id) =>
  ({
    guide: guide.isOpen(),
    rotate: viewer.tool === 'rotate',
    pan: viewer.tool === 'pan',
    zoom: viewer.tool === 'zoom',
    shaded: viewer.mode === 'shaded',
    wireframe: viewer.mode === 'wireframe',
    edges: viewer.mode === 'edges',
    clay: viewer.clay,
    grid: viewer.showGrid,
    axes: viewer.showAxes,
  })[id] ?? false;

refreshButtons = setupTopbar(document.getElementById('topbar-buttons'), actions, isActive);
refreshButtons();
const resetPlayer = setupPlayer(document.getElementById('player'), viewer);
setupAutoHide(['topbar', 'player'].map((id) => document.getElementById(id)));

// Turn transitions on once the first frames are drawn (see .booting in theme.css).
requestAnimationFrame(() =>
  requestAnimationFrame(() => document.documentElement.classList.remove('booting')),
);
setupShortcuts(actions);

/* ---------------- Drag & drop ---------------- */

const setDragging = (on) => document.body.classList.toggle('dragging', on);

if (IN_TAURI) {
  // Desktop app: Tauri handles the drop natively and gives us real file paths.
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'over') setDragging(true);
    else if (payload.type === 'leave') setDragging(false);
    else if (payload.type === 'drop') {
      setDragging(false);
      openPaths(payload.paths);
    }
  });
} else {
  // Plain browser (npm run dev): standard HTML5 drag & drop.
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    setDragging(true);
  });
  window.addEventListener('dragleave', () => setDragging(false));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    setDragging(false);
    openFiles([...e.dataTransfer.files]);
  });
}

/* ---------------- Files from Windows ---------------- */

if (IN_TAURI) {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  // File double-clicked while Lighter was already open: the second launch
  // forwards its path here instead of opening a new window.
  listen('open-file', ({ payload }) => openPath(payload));

  // File this launch was started with (double-click / "Open with" / command line).
  const startup = await invoke('startup_file');
  if (startup) openPath(startup);
}
