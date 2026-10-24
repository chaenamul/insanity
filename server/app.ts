import { Hono } from 'hono';
import { checkOrigin, loadUser, type AppEnv } from './auth';
import type { Db } from './db';
import { authRoutes } from './routes/auth';
import { myStoryRoutes } from './routes/my-stories';
import { storyRoutes } from './routes/stories';

// API: /api/auth/*  /api/stories/* (플레이어)  /api/my/stories/* (제작자)

export function createApp(db: Db) {
  const app = new Hono<AppEnv>();

  app.use('/api/*', async (c, next) => {
    c.set('db', db);
    await next();
  });
  app.use('/api/*', checkOrigin);
  app.use('/api/*', loadUser);

  app.route('/api/auth', authRoutes);
  app.route('/api/stories', storyRoutes);
  app.route('/api/my/stories', myStoryRoutes);
  app.all('/api/*', (c) => c.json({ error: '없는 API입니다' }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: '서버 오류가 발생했습니다' }, 500);
  });
  return app;
}
