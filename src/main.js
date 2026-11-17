// App start and file-open handling.
import { Viewer } from './viewer.js';
import { ViewCube } from './viewcube.js';
import { loadModel, extensionOf, SUPPORTED } from './loaders.js';
import { setupAutoHide, setFileInfo, setupShortcuts } from './ui.js';

const viewer = new Viewer(document.getElementById('viewport'));
new ViewCube(viewer);

const emptyState = document.getElementById('empty');
const fileInput = document.getElementById('file-input');

async function openFile(file) {
  if (!SUPPORTED.includes(extensionOf(file.name))) {
    console.warn(`Unsupported file: ${file.name}`);
    return;
  }
  try {
    const { object } = await loadModel(await file.arrayBuffer(), file.name);
    viewer.setModel(object);
    emptyState.classList.add('gone');
    setFileInfo(file.name, viewer.stats());
    setWindowTitle(`${file.name} — Lighter`);
  } catch (err) {
    console.error(err);
  }
}

async function setWindowTitle(title) {
  document.title = title;
  // In the desktop app also set the native window title.
  if (window.__TAURI_INTERNALS__) {
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
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) openFile(file);
});

setupAutoHide(document.getElementById('topbar'));
setupShortcuts({ open: pickFile, frame: () => viewer.frame() });
