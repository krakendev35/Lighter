# Lighter

A lightweight 3D viewer for Windows — a replacement for the removed "3D Viewer".
Built with Tauri + three.js. See [plan.md](plan.md) for the full plan.

## Prerequisites
- Node.js LTS
- Rust (https://rustup.rs, MSVC toolchain)
- Visual Studio Build Tools with "Desktop development with C++"
- WebView2 (already on Windows 10/11)

## Run
```bash
npm install
npm run tauri dev     # desktop app
npm run dev           # browser only, http://localhost:1420
```

## Build installer
```bash
npm run tauri build
```

## Icons
`src-tauri/icons/` holds a placeholder. Regenerate from the final icon with:
```bash
npx tauri icon path/to/icon-1024.png
```
