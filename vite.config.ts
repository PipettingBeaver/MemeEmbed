/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// Relative base so the build works from any GitHub Pages project path.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
