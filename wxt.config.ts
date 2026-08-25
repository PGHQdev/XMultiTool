import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { manifest } from './src/manifest.config'

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  modules: ['@wxt-dev/module-svelte'],
  manifest,
  vite: () => ({ plugins: [tailwind()] }),
})
