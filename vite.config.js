import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Le bundle produit est un IIFE : on retire `type="module" crossorigin` de la
 * balise script pour que `dist/index.html` s'ouvre aussi en double-clic (file://).
 */
const classicScriptTag = {
  name: 'classic-script-tag',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml (html) {
    return html.replace(/<script type="module" crossorigin/g, '<script defer')
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), classicScriptTag],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: { open: true },
  build: {
    outDir: 'dist',
    // Un seul bundle classique : le dossier dist/ reste ouvrable en double-clic (file://)
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' }
    }
  }
})
