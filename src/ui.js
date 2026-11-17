// Top bar, keyboard hints, auto-hide and keyboard shortcuts.

const HIDE_AFTER_MS = 2000;

/** Show the top bar while the mouse moves; hide it after ~2 s idle. */
export function setupAutoHide(topbar) {
  let timer = null;
  let hovering = false;

  topbar.addEventListener('mouseenter', () => (hovering = true));
  topbar.addEventListener('mouseleave', () => (hovering = false));

  window.addEventListener('mousemove', () => {
    if (!topbar.dataset.enabled) return;
    topbar.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(function hide() {
      if (hovering) timer = setTimeout(hide, HIDE_AFTER_MS);
      else topbar.classList.add('hidden');
    }, HIDE_AFTER_MS);
  });
}

/** Write file name and short meta into the top bar. */
export function setFileInfo(name, { triangles, size }) {
  document.getElementById('file-name').textContent = name;
  const fmt = (n) => (n >= 100 ? Math.round(n) : n.toFixed(1));
  document.getElementById('file-meta').textContent =
    `${triangles.toLocaleString('en-US')} tris · ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}`;
  document.getElementById('topbar').dataset.enabled = '1';
}

/** Global keyboard shortcuts. `actions` is a map of handlers. */
export function setupShortcuts(actions) {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      actions.open();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case 'f':
        actions.frame();
        break;
      // TODO (milestone 3): W wireframe, E edges, C clay, G grid
      // TODO (milestone 5): ← → previous / next file
    }
  });
}
