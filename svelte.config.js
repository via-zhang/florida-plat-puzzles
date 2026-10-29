import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Boards and the map read props once at setup; they are re-created when inputs change.
    warningFilter: (w) => w.code !== 'state_referenced_locally',
  },
};
