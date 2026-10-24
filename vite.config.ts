import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
const apiPort = Number(process.env.PORT ?? 3000);

// /play/<id> → play.html, /edit/<id> → editor.html (그 밖의 경로는 index.html = 플랫폼 화면)
const pageRoutes: Connect.NextHandleFunction = (req, _res, next) => {
  const [path, query = ''] = (req.url ?? '').split('?');
  if (/^\/play\/[^/]+\/?$/.test(path)) req.url = `/play.html${query ? `?${query}` : ''}`;
  else if (/^\/edit\/[^/]+\/?$/.test(path)) req.url = `/editor.html${query ? `?${query}` : ''}`;
  next();
};

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    {
      name: 'insanity-page-routes',
      configureServer: (server) => void server.middlewares.use(pageRoutes),
      configurePreviewServer: (server) => void server.middlewares.use(pageRoutes),
    },
  ],
  server: {
    // 같은 와이파이의 휴대폰에서 http://<PC IP>:5173 으로 접속할 수 있도록 모든 네트워크 주소에서 받는다
    host: true,
    // API는 server/ (npm run dev가 함께 띄움). Host 헤더를 그대로 넘겨야 서버의 출처 확인이 맞는다
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  build: {
    rolldownOptions: {
      input: {
        main: `${root}index.html`,
        play: `${root}play.html`,
        editor: `${root}editor.html`,
      },
    },
  },
});
