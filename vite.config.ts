import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { contentApi } from './tools/vite-content-api.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react(), contentApi(root)],
  // 같은 와이파이의 휴대폰에서 http://<PC IP>:5173 으로 접속할 수 있도록 모든 네트워크 주소에서 받는다
  server: { host: true },
  build: {
    rolldownOptions: {
      input: {
        main: `${root}index.html`,
        editor: `${root}editor.html`,
      },
    },
  },
});
