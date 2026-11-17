// App start and file-open handling.
import { Viewer } from './viewer.js';
import { ViewCube } from './viewcube.js';
import { loadModel, makeResolver, extensionOf, SUPPORTED } from './loaders.js';
import { setupTopbar, setupHints, setupAutoHide, setFileInfo, setupShortcuts } from './ui.js';

const IN_TAURI = !!window.__TAURI_INTERNALS__;

const viewer = new Viewer(document.getElementById('viewport'));
const viewCube = new ViewCube(viewer, document.body);

const fileInput = document.getElementById('file-input');

/* ---------------- Opening files ---------------- */

/**
 * Show a model from raw bytes + its file name.
 * `resolve` finds the textures / .mtl / .bin files the model refers to.
 */
async function showModel(buffer, name, resolve = null) {
  const format = extensionOf(name);
  if (!SUPPORTED.includes(format)) {
    console.warn(`Unsupported file: ${name}`);
    return;
  }
  try {
    const { object } = await loadModel(buffer, name, resolve);
    viewer.setModel(object);
    document.body.classList.add('has-model');
    setFileInfo(name, viewer.stats(), { format, bytes: buffer.byteLength });
    setWindowTitle(`${name} — Lighter`);
  } catch (err) {
    console.error(err);
  }
}

const isModel = (name) => SUPPORTED.includes(extensionOf(name));

/**
 * Open browser File objects (plain-browser drop / file picker). The first
 * model is shown; the other files (textures, .mtl, .bin) are available to it.
 */
let blobUrls = [];
async function openFiles(files) {
  const model = files.find((f) => isModel(f.name));
  if (!model) return;

  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls = [];
  const byName = new Map(files.map((f) => [f.name, f]));
  const resolve = makeResolver([...byName.keys()], (name) => {
    const url = URL.createObjectURL(byName.get(name));
    blobUrls.push(url);
    return url;
  });
  showModel(await model.arrayBuffer(), model.name, resolve);
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
    showModel(buffer, path.split(/[\\/]/).pop(), resolve);
  } catch (err) {
    console.error(err);
  }
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

let refreshButtons = () => {};
const withRefresh = (fn) => () => {
  fn();
  refreshButtons();
};

const actions = {
  open: pickFile,
  shaded: withRefresh(() => viewer.setMode('shaded')),
  wireframe: withRefresh(() => viewer.setMode('wireframe')),
  edges: withRefresh(() => viewer.setMode('edges')),
  toggleWireframe: withRefresh(() => toggleMode('wireframe')),
  toggleEdges: withRefresh(() => toggleMode('edges')),
  clay: withRefresh(() => viewer.toggleClay()),
  grid: withRefresh(() => viewer.toggleGrid()),
  axes: withRefresh(() => viewer.toggleAxes()),
  theme: withRefresh(() => applyTheme(viewer.theme === 'dark' ? 'light' : 'dark')),
  fit: () => viewer.frame({ keepDirection: true }),
};

const isActive = (id) =>
  ({
    shaded: viewer.mode === 'shaded',
    wireframe: viewer.mode === 'wireframe',
    edges: viewer.mode === 'edges',
    clay: viewer.clay,
    grid: viewer.showGrid,
    axes: viewer.showAxes,
  })[id] ?? false;

refreshButtons = setupTopbar(document.getElementById('topbar-buttons'), actions, isActive);
refreshButtons();
setupHints(document.getElementById('hints'));
setupAutoHide([document.getElementById('topbar'), document.getElementById('hints')]);
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
