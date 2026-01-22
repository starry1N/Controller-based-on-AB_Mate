import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs']
    },
    outDir: 'dist/main',
    rollupOptions: {
      external: ['electron', 'electron-is-dev'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js'
      }
    },
    minify: false,
    sourcemap: true,
    target: 'node18'
  }
})
