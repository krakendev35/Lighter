// Top bar, animation player, auto-hide and keyboard shortcuts.
// Every shortcut is shown in its button's tooltip, taken from the keymap so
// it stays right after the user rebinds keys.
import { keymap, keyFromEvent, displayKey } from './keymap.js';

const HIDE_AFTER_MS = 2000;

/** "Label (Key)" for tooltips; just "Label" when the action has no key. */
function withKey(id, label = keymap.label(id)) {
  const key = displayKey(keymap.get(id));
  return key ? `${label} (${key})` : label;
}

/** 8-tooth gear outline, centred in the 18px icon box. */
function gearIcon() {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const [da, r] of [[-0.3, 5.4], [-0.17, 7.3], [0.17, 7.3], [0.3, 5.4]]) {
      pts.push(`${(9 + r * Math.cos(a + da)).toFixed(2)} ${(9 + r * Math.sin(a + da)).toFixed(2)}`);
    }
  }
  return `<path d="M${pts.join('L')}Z"/><circle cx="9" cy="9" r="2.3"/>`;
}

// Thin-line 18px icons, 1.5px stroke (see theme.css for stroke settings).
const ICONS = {
  open: '<path d="M2.5 4.5h4.5l1.5 1.5h7v8.5h-13z"/>',
  rotate: '<path d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/>',
  pan: '<path d="M9 2v14M2 9h14M7 4l2-2 2 2M7 14l2 2 2-2M4 7 2 9l2 2M14 7l2 2-2 2"/>',
  zoom: '<circle cx="8" cy="8" r="5"/><path d="M11.6 11.6 15.5 15.5M8 6v4M6 8h4"/>',
  center: '<circle cx="9" cy="9" r="5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><path d="M9 1.5V4M9 14v2.5M1.5 9H4M14 9h2.5"/>',
  fit: '<path d="M2.5 6V2.5H6M12 2.5h3.5V6M15.5 12v3.5H12M6 15.5H2.5V12"/><rect x="6" y="6" width="6" height="6" rx=".5"/>',
  shaded:
    '<circle cx="9" cy="9" r="6.5"/><path d="M9 2.5a6.5 6.5 0 0 1 0 13a3.5 6.5 0 0 0 0-13z" fill="currentColor" stroke="none"/>',
  wireframe: '<circle cx="9" cy="9" r="6.5"/><ellipse cx="9" cy="9" rx="2.8" ry="6.5"/><path d="M2.5 9h13"/>',
  edges:
    '<path d="M9 2.5l6 3.25v6.5L9 15.5l-6-3.25v-6.5z" fill="currentColor" fill-opacity=".3"/><path d="M3 5.75 9 9l6-3.25M9 9v6.5"/>',
  clay: '<circle cx="9" cy="8" r="5"/><path d="M4.5 15.5h9"/>',
  grid: '<rect x="2.5" y="2.5" width="13" height="13" rx="1"/><path d="M2.5 7h13M2.5 11h13M7 2.5v13M11 2.5v13"/>',
  axes: '<path d="M5.5 12.5V2.5M5.5 12.5h10M5.5 12.5 2 16"/>',
  screenshot:
    '<rect x="2.5" y="5" width="13" height="9.5" rx="1"/><circle cx="9" cy="9.75" r="2.5"/><path d="M6.5 5l1-2h3l1 2"/>',
  theme: '<circle cx="9" cy="9" r="6.5"/><path d="M9 2.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none"/>',
  keybinds: gearIcon(),
  play: '<path d="M6 4v10l8-5z" fill="currentColor"/>',
  pause: '<path d="M6.5 4.5v9M11.5 4.5v9"/>',
};

// '|' = divider between button groups. Button ids are keymap action ids;
// `extra` is appended to the tooltip after the label and key.
const BUTTONS = [
  { id: 'open' },
  '|',
  { id: 'rotate', extra: 'left-drag rotates' },
  { id: 'pan', extra: 'left-drag moves the view · right-drag pans with any tool' },
  { id: 'zoom', extra: 'left-drag up/down zooms · wheel zooms with any tool' },
  '|',
  { id: 'center', extra: 'keeps zoom and angle' },
  { id: 'fit', extra: 'center and zoom to fit' },
  '|',
  { id: 'shaded' },
  { id: 'wireframe' },
  { id: 'edges' },
  { id: 'clay' },
  '|',
  { id: 'grid' },
  { id: 'axes' },
  '|',
  { id: 'screenshot', extra: 'PNG' },
  { id: 'theme' },
  { id: 'keybinds', extra: 'change keys' },
];

/**
 * Build the top-bar buttons. `actions[id]()` runs on click and `isActive(id)`
 * says whether a button shows as toggled on. Returns a refresh() function to
 * call whenever the state changes.
 */
export function setupTopbar(container, actions, isActive) {
  const buttons = {};
  for (const b of BUTTONS) {
    if (b === '|') {
      container.insertAdjacentHTML('beforeend', '<span class="divider"></span>');
      continue;
    }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'icon-btn';
    el.innerHTML = `<svg viewBox="0 0 18 18" width="18" height="18">${ICONS[b.id]}</svg>`;
    el.addEventListener('click', () => actions[b.id]());
    container.appendChild(el);
    buttons[b.id] = { el, extra: b.extra };
  }

  function updateTitles() {
    for (const [id, { el, extra }] of Object.entries(buttons)) {
      const title = extra ? `${withKey(id)} · ${extra}` : withKey(id);
      el.title = title;
      el.setAttribute('aria-label', title);
    }
  }
  updateTitles();
  keymap.onChange(updateTitles);

  return function refresh() {
    for (const [id, { el }] of Object.entries(buttons)) {
      el.classList.toggle('active', isActive(id));
    }
  };
}

/**
 * Animation bar: play/pause, timeline slider, time, and a clip picker when
 * the model has more than one animation. Reads `viewer.player` every frame.
 * Returns reset(), to call after a new model is loaded.
 */
export function setupPlayer(container, viewer) {
  container.innerHTML = `
    <button type="button" class="icon-btn" id="play-btn"></button>
    <input type="range" id="timeline" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
    <span id="anim-time"></span>
    <select id="clip-select" aria-label="Animation"></select>`;
  const playBtn = container.querySelector('#play-btn');
  const slider = container.querySelector('#timeline');
  const timeEl = container.querySelector('#anim-time');
  const select = container.querySelector('#clip-select');
  let dragging = false;
  let shownPlaying = null;

  const updatePlayTitle = () => {
    playBtn.title = withKey('playPause');
    playBtn.setAttribute('aria-label', playBtn.title);
  };
  updatePlayTitle();
  keymap.onChange(updatePlayTitle);

  const fmt = (t) => {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  };

  playBtn.addEventListener('click', () => viewer.player?.toggle());
  // Holding the knob freezes the animation where the knob is; letting go
  // carries on as before (playing or paused). The release is caught on the
  // window, so it still counts when the mouse is let go outside the slider.
  slider.addEventListener('pointerdown', () => {
    dragging = true;
    if (viewer.player) viewer.player.scrubbing = true;
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (viewer.player) viewer.player.scrubbing = false;
    slider.blur(); // so Space goes back to play/pause instead of the slider
  });
  slider.addEventListener('input', () => viewer.player?.seek(Number(slider.value)));
  select.addEventListener('change', () => {
    select.blur();
    viewer.player?.select(Number(select.value));
    reset();
  });

  viewer.onFrame(() => {
    const p = viewer.player;
    if (!p) return;
    if (shownPlaying !== p.playing) {
      shownPlaying = p.playing;
      playBtn.innerHTML = `<svg viewBox="0 0 18 18" width="18" height="18">${p.playing ? ICONS.pause : ICONS.play}</svg>`;
    }
    if (!dragging) slider.value = p.time;
    timeEl.textContent = `${fmt(p.time)} / ${fmt(p.duration)}`;
  });

  function reset() {
    const p = viewer.player;
    document.body.classList.toggle('has-animation', !!p);
    if (!p) return;
    slider.max = p.duration;
    select.innerHTML = p.clips
      .map((c, i) => `<option value="${i}">${escapeHtml(c.name || `Animation ${i + 1}`)}</option>`)
      .join('');
    select.value = p.index;
    select.hidden = p.clips.length < 2;
    shownPlaying = null;
  }
  return reset;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/**
 * Controls appear when the mouse moves and fade out after ~2 s without
 * movement or while orbiting. They stay while the cursor is over them.
 */
export function setupAutoHide(panels) {
  let timer = null;
  let hovering = 0;
  const show = (on) => document.body.classList.toggle('controls-visible', on);

  for (const panel of panels) {
    panel.addEventListener('mouseenter', () => hovering++);
    panel.addEventListener('mouseleave', () => (hovering = Math.max(0, hovering - 1)));
  }

  window.addEventListener('mousemove', (e) => {
    clearTimeout(timer);
    // Dragging on the 3D view = orbiting/panning: keep the view clear.
    if (e.buttons && e.target.closest('#viewport')) {
      show(false);
      return;
    }
    show(true);
    timer = setTimeout(function hide() {
      if (hovering > 0) timer = setTimeout(hide, HIDE_AFTER_MS);
      else show(false);
    }, HIDE_AFTER_MS);
  });
}

/** Write file name, short meta and the detail tooltip into the top bar. */
export function setFileInfo(name, { triangles, vertices, size }, { format, bytes }) {
  const fmt = (n) => (n >= 100 ? Math.round(n) : n.toFixed(1));
  const nameEl = document.getElementById('file-name');
  nameEl.textContent = name;
  nameEl.title = `${format.toUpperCase()} · ${vertices.toLocaleString('en-US')} vertices · ${formatBytes(bytes)}`;
  document.getElementById('file-meta').textContent =
    `${triangles.toLocaleString('en-US')} tris · ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * Global keyboard shortcuts, looked up in the keymap. `actions` is the same
 * map the top bar uses (keymap action id → function).
 */
export function setupShortcuts(actions) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // The clip picker keeps all its keys; the timeline slider keeps the keys
    // it uses for stepping (arrows, Home/End, Page Up/Down).
    if (e.target.closest?.('select')) return;
    if (e.target.type === 'range' && /^(Arrow|Home$|End$|Page)/.test(e.key)) return;

    const key = keyFromEvent(e);
    const id = key && keymap.actionFor(key);
    if (!id || !actions[id]) return;
    e.preventDefault(); // e.g. Space would otherwise "click" the last focused button
    actions[id]();
  });
}
