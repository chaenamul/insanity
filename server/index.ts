import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { config, requireDatabaseUrl } from './config';
import { createDb } from './db';
import { migrate } from './migrate';

// 서버 실행
//   개발: npm run dev  → 이 서버(API)와 Vite(화면)가 함께 뜨고, Vite가 /api를 이 서버로 넘긴다
//   배포: npm run build && npm start → 이 서버 하나가 API와 빌드된 화면(dist/)을 모두 제공

const db = createDb(requireDatabaseUrl());
await migrate(db);
const app = createApp(db);

if (config.production) {
  if (!existsSync('./dist/index.html')) throw new Error('dist/가 없습니다. 먼저 npm run build를 실행하세요.');
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.get('/play/*', serveStatic({ path: './dist/play.html' }));
  app.get('/edit/*', serveStatic({ path: './dist/editor.html' }));
  app.get('*', serveStatic({ root: './dist' }));
  // 그 밖의 경로(/, /create, /login …)는 플랫폼 화면
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`서버 실행 중: http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}${config.production ? '' : ' (API)'}`);
});

const shutdown = () => {
  server.close();
  db.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
