import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
