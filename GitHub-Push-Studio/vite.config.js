import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // Vite 8 uses the Oxc transformer; React's automatic JSX runtime needs no inline scripts.
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome128' },
  server: { host: '127.0.0.1', port: 5173, strictPort: true }
})
