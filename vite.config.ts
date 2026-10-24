import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { contentApi } from './tools/vite-content-api.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react(), contentApi(root)],
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        editor: `${root}editor.html`,
      },
    },
  },
});
