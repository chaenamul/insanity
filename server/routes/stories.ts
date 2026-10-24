import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { PlayStoryResponse, StorySummary } from '../../src/shared/api-types';
import { requireUser, type AppEnv } from '../auth';

// 플레이어용: 공개된 이야기 목록, 공개본 불러오기, 진행 저장

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const storyRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .use('/:id/*', async (c, next) => {
    if (!UUID_RE.test(c.req.param('id') ?? '')) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    await next();
  })

  .get('/', async (c) => {
    const rows = await c.var.db.query<{
      id: string;
      title: string | null;
      subtitle: string | null;
      author_name: string;
      published_at: Date;
      has_save: boolean;
    }>(
      `SELECT s.id, s.published->'meta'->>'title' AS title, s.published->'meta'->>'subtitle' AS subtitle,
              u.display_name AS author_name, s.published_at, (sv.user_id IS NOT NULL) AS has_save
       FROM stories s
       JOIN users u ON u.id = s.author_id
       LEFT JOIN saves sv ON sv.story_id = s.id AND sv.user_id = $1
       WHERE s.published IS NOT NULL
       ORDER BY s.published_at DESC`,
      [c.var.user!.id],
    );
    const stories: StorySummary[] = rows.map((r) => ({
      id: r.id,
      title: r.title || '제목 없음',
      subtitle: r.subtitle ?? '',
      authorName: r.author_name,
      publishedAt: r.published_at.toISOString(),
      hasSave: r.has_save,
    }));
    return c.json({ stories });
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    const rows = await c.var.db.query<{ id: string; published: PlayStoryResponse['content']; author_name: string }>(
      `SELECT s.id, s.published, u.display_name AS author_name FROM stories s JOIN users u ON u.id = s.author_id
       WHERE s.id = $1 AND s.published IS NOT NULL`,
      [id],
    );
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없거나 공개되지 않았습니다' }, 404);
    const res: PlayStoryResponse = {
      story: { id: rows[0].id, title: rows[0].published.meta?.title ?? '', authorName: rows[0].author_name },
      content: rows[0].published,
    };
    return c.json(res);
  })

  .get('/:id/save', async (c) => {
    const rows = await c.var.db.query<{ state: unknown }>('SELECT state FROM saves WHERE user_id = $1 AND story_id = $2', [
      c.var.user!.id,
      c.req.param('id'),
    ]);
    return c.json({ state: rows[0]?.state ?? null });
  })

  .put('/:id/save', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.state !== 'object' || body.state === null || Array.isArray(body.state)) {
      return c.json({ error: '잘못된 저장 형식입니다' }, 400);
    }
    const rows = await c.var.db.query(
      `INSERT INTO saves (user_id, story_id, state)
       SELECT $1, s.id, $3::jsonb FROM stories s WHERE s.id = $2 AND s.published IS NOT NULL
       ON CONFLICT (user_id, story_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()
       RETURNING story_id`,
      [c.var.user!.id, c.req.param('id'), JSON.stringify(body.state)],
    );
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    return c.json({ ok: true });
  })

  .delete('/:id/save', async (c) => {
    await c.var.db.query('DELETE FROM saves WHERE user_id = $1 AND story_id = $2', [c.var.user!.id, c.req.param('id')]);
    return c.json({ ok: true });
  });
