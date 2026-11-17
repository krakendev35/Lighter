import { defineConfig } from 'vite';

// Settings recommended by Tauri: fixed port, don't clear Tauri's terminal output,
// and don't watch the Rust folder.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // three.js alone is ~600 kB; that's fine for a local desktop app.
    chunkSizeWarningLimit: 1000,
  },
});
