# Lighter — Plan

## Working rules
- **Chat sessions (claude.ai / web) are for planning only.** Do not scaffold, install packages, or build anything there unless the user explicitly says "build this here".
- All building happens in **Claude Code on the user's desktop**.
- User is a beginner with C++; chosen stack is the one they can supervise.

## Name & identity (decided)
- **App name: Lighter** — a lightweight 3D viewer.
- Window title: `<file name> — Lighter` (e.g. `bracket.stl — Lighter`); just `Lighter` when no file is open.
- Executable / installer: `Lighter.exe`, `Lighter_<version>_x64-setup.exe` (and `.msi`).
- Tauri `productName`: `Lighter`; bundle identifier: `com.lighter.viewer` (change if the user has a preferred reverse-domain).
- "Open with" / file-association display name: `Lighter`.
- **Icon: TBD — the user will provide it later.** Until then use a placeholder (thin monochrome cube outline, as in the empty state). When it arrives, generate all sizes with `npx tauri icon <source.png>` (source ideally 1024×1024 PNG, transparent background).

## Goal
A replacement for the removed Windows "3D Viewer": open a 3D file and look at it. No editing, no modelling, no extra features.

## Stack (decided)
**Tauri + three.js** (vanilla JS + Vite). Small installer (~5–8 MB), uses the WebView2 runtime built into Windows.
Fallback if it ever feels too slow/heavy: native C++ (raylib/OpenGL + Assimp), to be revisited later.

## UI references (decided)
Surveyed: F3D, Online 3D Viewer (3dviewer.net), three.js glTF Viewer, Exhibit, fstl, Mayo.
**Visually: take nothing from them** — the look is our own monochrome design (below).
**Concepts taken:**
1. **Full-screen viewport** — the model fills the whole window; no sidebars, no menus.
2. **View cube** (concept from Mayo) — small cube in a corner; click a face/edge/corner to snap the camera to that view (front, top, right, isometric…), and it rotates in sync with the camera.

## Layout (decided): "Zen"
Mockups: Design canvas "3D Viewer — UI drafts" (https://claude.ai/artifact/PwEa1cpxJtDrB9qrn3TL8M). **Reference board: "Zen · Poppins — FINAL"** (Zen layout in the chosen font). Drafts A (floating toolbar) and B (edge rail) were rejected.
- The model is alone on screen by default — **no controls visible while idle**.
- Moving the mouse reveals:
  - **Top bar** (48px, full width): left = file name (semibold) + secondary meta (triangle count · dimensions); right = icon buttons: Open | Rotate, Pan, Zoom | Center, Fit | Shaded, Wireframe, Shaded+edges, Clay | Grid, Axes | Screenshot, Theme.
  - **Animation player** (bottom-center, animated models only): play/pause, timeline, time, clip picker.
- **No keyboard-hint strip** (removed: it cluttered the screen together with the player). Each shortcut is shown in its button's tooltip. Defaults: R Rotate · P Pan · Z Zoom · C Center · F Fit · W Wireframe · E Edges · Shift+C Clay · G Grid · Space Play/pause · ← → Prev/next file · Ctrl+O Open · H Guide (help; "?" needs Shift and moves between keyboard layouts).
- **Keybinds are customisable:** "Customize keys" in the guide panel opens the keybind editor; click a key and press the new one (Esc cancels, Backspace clears). A key already in use swaps with the old one. Saved per user (localStorage); "Reset to defaults" restores them.
- **View tools:** the selected tool decides what left-drag does (rotate / pan / zoom); right-drag always pans and the wheel always zooms. **Center (C)** slides the model back to the middle keeping zoom and angle; **Fit (F)** centres and zooms to fit.
- Controls fade out again after ~2 s without mouse movement (and while orbiting); they stay visible while the cursor is over them.
- **View cube** always visible, top-right (below the top bar when it's shown).
- Info panel from earlier plan is folded into the top bar meta; full details (vertices, file size, format) can show on hover/click of the file name.
- **Empty state** (board "Empty state"): centered thin cube icon, "Drop a 3D file here", "or press Ctrl + O", outlined "Open file" button, supported formats line, and below it a **quiet hint** (board "Start · A — One quiet line"): "Drag to rotate · Right-drag to pan · Scroll to zoom" and "Press H any time to see every shortcut" (the key shown follows the keymap).
- **Guide side panel** (board "In-app · A — Toggleable side panel"): H key or the ? (help) button at the end of the top bar toggles a 300 px panel on the right listing mouse controls and every shortcut, grouped (Mouse, View, Display, Animation for animated models, Files), built from the keymap. Footer: "Customize keys" opens the keybind editor. The 3D view, top bar, view cube and player make room for it; it stays until toggled and its open/closed state is remembered.

## Look & feel (decided)
Monochrome black & white. **Dark theme is the default**; light theme is a toggle (exact inverse).

**Dark theme palette (no accent colour — white is the "active" colour):**
| Role | Value |
|---|---|
| Viewport background | `#0d0d0d` |
| Panels / bars | `#141414`, 1px border `#2a2a2a` |
| Primary text / icons | `#f2f2f2` |
| Secondary text | `#8a8a8a` |
| Hover | background `#222` |
| Active / toggled button | white background, black icon (inverted) |
| Keyboard key chips | `#1c1c1c` with `#2a2a2a` border |
| Grid | `#262626`, fading out with distance |
| Axes | grayscale "infinite" lines through the origin, fading out at both ends like the grid (positive side brighter); small X / Y / Z labels just outside the model (no RGB) |
| Edge overlay (shaded + edges) | `#ffffff` at ~35% opacity |
| Wireframe | `#e6e6e6` |
| Title bar | `#0a0a0a` |

**Light theme:** same structure inverted — background `#f2f2f2`, panels `#ffffff`, border `#dcdcdc`, text `#111`, secondary `#6b6b6b`, active = black background with white icon.

**Typography (decided): Poppins**
- Single family for the whole UI. Free (SIL Open Font License).
- Weights: 400 (body/meta), 500 (labels), 600 (file name, headings). Ship only these as `woff2` files in `src/fonts/` — **bundled with the app, never loaded from the internet**.
- Sizes: top-bar file name 13px/600; meta and key hints 12px/400; key-chip letters 11px; empty-state headline 18px/600.
- Because Poppins is wide, keep top-bar meta short (e.g. "48,216 tris · 80 × 60 × 80 mm") and let it truncate with an ellipsis before it collides with the buttons.
- Fallback stack: `'Poppins', 'Segoe UI', system-ui, sans-serif`.

**UI style:**
- Thin-line monochrome icons (1.5px stroke, 18px)
- Square-ish corners (4px radius, 6px for floating panels), no shadows, no colour anywhere in the UI
- Native window title bar set to dark mode to match

**View cube style:** ~96px, top-right. Faces `#141414` with thin `#3a3a3a` outlines and small uppercase labels (TOP, FRONT, RIGHT…) in `#8a8a8a`, set in Poppins 600; hovered face/edge/corner highlights white with black label. Smooth animated camera transition on click (~300 ms). Inverts in light theme.

**Model display (decided):**
- Models **show their own colours/textures by default** — the monochrome style applies to the UI, not the model.
- Files with no colour info (e.g. most STL) get a neutral light-gray matte material (`#bfbfbf`).
- **"Clay" toggle** (off by default) overrides all materials with that same neutral gray for a fully monochrome look.
- Neutral white studio lighting (no tinted lights).

## Scope
**In:**
- Open via double-click (file association / "Open with"), drag & drop, Ctrl+O
- Orbit / pan / zoom mouse controls; auto-frame model on load; "F" to re-frame
- View cube for snapping to standard views
- Display modes: shaded, wireframe, shaded + edges; clay mode; grid/floor and axes toggles; dark/light theme toggle
- File info: name, triangle count, dimensions in the top bar; vertices, format, file size on demand
- Animation playback for glTF/FBX (play/pause + timeline slider)
- PNG screenshot
- Arrow keys step to previous/next model in the same folder
- Auto-hiding controls (Zen layout)

**Out:** editing, sculpting, painting, format conversion, slicing, plugins, cloud, auto-update, accounts.

**Formats:** STL, OBJ (+MTL & textures), glTF/GLB, FBX, PLY, 3MF. (STEP/IGES CAD excluded — much bigger job.)

## Milestones
1. **Core** — window, full-screen three.js viewport, OrbitControls, auto-framing, load STL/OBJ/GLB via drag & drop, dark theme base styles, bundled Poppins, empty state, placeholder icon
2. **Windows integration** — file associations, CLI path argument, single-instance window (second double-click reuses the open window), dark title bar, window title `<file> — Lighter`
3. **Display** — wireframe/edges, clay mode, grid & axes, theme toggle, auto-hiding top bar + keyboard hints, view cube
4. **More formats** — FBX, PLY, 3MF; resolve textures from relative paths
5. **Extras** — animation playback, screenshot, folder navigation
6. **Packaging** — final icon (user-provided), MSI/NSIS installer and/or portable `Lighter.exe`

Milestones 1–3 = daily-usable viewer.

## Desktop prerequisites (Windows)
- Node.js LTS
- Rust (rustup, MSVC toolchain)
- Visual Studio Build Tools with "Desktop development with C++" workload (needed by Rust on Windows, no C++ coding involved)
- WebView2 runtime (already present on Windows 10/11)

## Sketch of project layout
```
lighter/
  index.html
  src/
    main.js        # app start, file open handling
    viewer.js      # scene, camera, controls, lighting, framing
    viewcube.js    # view cube overlay + camera snapping
    loaders.js     # extension -> three.js loader mapping
    ui.js          # top bar, keyboard hints, auto-hide, shortcuts
    theme.css      # CSS variables for dark/light themes + @font-face for Poppins
    fonts/         # Poppins-Regular/Medium/SemiBold .woff2 + OFL license file
  src-tauri/
    tauri.conf.json  # productName "Lighter", identifier, file associations, dark window theme
    icons/           # generated by `npx tauri icon` once the user's icon arrives
    src/main.rs      # CLI arg / single-instance -> send path to frontend
```
