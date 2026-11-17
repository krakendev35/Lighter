// App start and file-open handling.
import { Viewer } from './viewer.js';
import { ViewCube } from './viewcube.js';
import { loadModel, extensionOf, SUPPORTED } from './loaders.js';
import { setupAutoHide, setFileInfo, setupShortcuts } from './ui.js';

const IN_TAURI = !!window.__TAURI_INTERNALS__;

const viewer = new Viewer(document.getElementById('viewport'));
new ViewCube(viewer);

const emptyState = document.getElementById('empty');
const fileInput = document.getElementById('file-input');

/** Show a model from raw bytes + its file name. */
async function showModel(buffer, name) {
  if (!SUPPORTED.includes(extensionOf(name))) {
    console.warn(`Unsupported file: ${name}`);
    return;
  }
  try {
    const { object } = await loadModel(buffer, name);
    viewer.setModel(object);
    emptyState.classList.add('gone');
    setFileInfo(name, viewer.stats());
    setWindowTitle(`${name} — Lighter`);
  } catch (err) {
    console.error(err);
  }
}

/** Open a browser File object (file picker, or drop when running in a plain browser). */
async function openFile(file) {
  showModel(await file.arrayBuffer(), file.name);
}

/** Open a file by its path on disk (desktop app only). */
async function openPath(path) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const buffer = await invoke('read_file', { path });
    showModel(buffer, path.split(/[\\/]/).pop());
  } catch (err) {
    console.error(err);
  }
}

async function setWindowTitle(title) {
  document.title = title;
  // In the desktop app also set the native window title.
  if (IN_TAURI) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().setTitle(title);
  }
}

// Ctrl+O / "Open file" button. (A native dialog via tauri-plugin-dialog can replace this later.)
const pickFile = () => fileInput.click();
document.getElementById('open-btn').addEventListener('click', pickFile);
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) openFile(fileInput.files[0]);
  fileInput.value = '';
});

// Drag & drop
const setDragging = (on) => document.body.classList.toggle('dragging', on);

if (IN_TAURI) {
  // Desktop app: Tauri handles the drop natively and gives us real file paths.
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'over') setDragging(true);
    else if (payload.type === 'leave') setDragging(false);
    else if (payload.type === 'drop') {
      setDragging(false);
      if (payload.paths.length) openPath(payload.paths[0]);
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
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  });
}

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

setupAutoHide(document.getElementById('topbar'));
setupShortcuts({ open: pickFile, frame: () => viewer.frame() });
