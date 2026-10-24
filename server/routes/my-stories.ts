import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createEncounter, normalizeContent } from '../../src/engine/content';
import type { GameContent } from '../../src/engine/types';
import { validateContent } from '../../src/engine/validate';
import type { EditStoryInfo, MyStorySummary } from '../../src/shared/api-types';
import { requireUser, type AppEnv } from '../auth';

// 제작자용: 내 이야기 목록/생성/편집 저장/공개/삭제. 다른 사람의 이야기는 없는 것처럼 404.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoryRow {
  id: string;
  draft: GameContent;
  draft_version: number;
  is_published: boolean;
  has_unpublished_changes: boolean;
  updated_at: Date;
  published_at: Date | null;
}

const STATUS_COLUMNS = `
  (published IS NOT NULL) AS is_published,
  (published IS NOT NULL AND published IS DISTINCT FROM draft) AS has_unpublished_changes`;

function info(r: Omit<StoryRow, 'draft'>): EditStoryInfo {
  return {
    id: r.id,
    version: r.draft_version,
    isPublished: r.is_published,
    hasUnpublishedChanges: r.has_unpublished_changes,
    updatedAt: r.updated_at.toISOString(),
    publishedAt: r.published_at?.toISOString() ?? null,
  };
}

/** 새 이야기의 시작 내용: 1번째로 나오는 프롤로그 하나 */
export function starterContent(title: string): GameContent {
  const prologue = createEncounter('prologue', '프롤로그');
  prologue.spawn.mode = 'fixed';
  prologue.spawn.fixedTurn = 1;
  prologue.nodes[0].text = '이야기가 시작되는 곳.';
  prologue.nodes[0].choices[0].text = '계속한다';
  return normalizeContent({ meta: { title, subtitle: '', intro: '' }, encounters: [prologue] });
}

export const myStoryRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .use('/:id/*', async (c, next) => {
    if (!UUID_RE.test(c.req.param('id') ?? '')) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    await next();
  })

  .get('/', async (c) => {
    const rows = await c.var.db.query<
      Omit<StoryRow, 'draft'> & { title: string | null; subtitle: string | null; encounter_count: number }
    >(
      `SELECT id, draft->'meta'->>'title' AS title, draft->'meta'->>'subtitle' AS subtitle,
              jsonb_array_length(draft->'encounters') AS encounter_count, draft_version, updated_at, published_at, ${STATUS_COLUMNS}
       FROM stories WHERE author_id = $1 ORDER BY updated_at DESC`,
      [c.var.user!.id],
    );
    const stories: MyStorySummary[] = rows.map((r) => ({
      id: r.id,
      title: r.title || '제목 없음',
      subtitle: r.subtitle ?? '',
      encounterCount: r.encounter_count,
      isPublished: r.is_published,
      hasUnpublishedChanges: r.has_unpublished_changes,
      updatedAt: r.updated_at.toISOString(),
      publishedAt: r.published_at?.toISOString() ?? null,
    }));
    return c.json({ stories });
  })

  .post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title ?? '').trim().slice(0, 100) || '제목 없는 이야기';
    const rows = await c.var.db.query<{ id: string }>('INSERT INTO stories (author_id, draft) VALUES ($1, $2::jsonb) RETURNING id', [
      c.var.user!.id,
      JSON.stringify(starterContent(title)),
    ]);
    return c.json({ id: rows[0].id }, 201);
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    const rows = await c.var.db.query<StoryRow>(
      `SELECT id, draft, draft_version, updated_at, published_at, ${STATUS_COLUMNS} FROM stories WHERE id = $1 AND author_id = $2`,
      [id, c.var.user!.id],
    );
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    const { draft, ...rest } = rows[0];
    return c.json({ story: info(rest), content: draft });
  })

  // 초안 저장. version이 서버와 다르면 다른 곳(다른 탭/기기)에서 먼저 저장한 것이므로 409
  .put('/:id', bodyLimit({ maxSize: 5 * 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.content !== 'object' || !Number.isInteger(body.version)) {
      return c.json({ error: '잘못된 형식입니다' }, 400);
    }
    const content = normalizeContent(body.content);
    const rows = await c.var.db.query<Omit<StoryRow, 'draft'>>(
      `UPDATE stories SET draft = $3::jsonb, draft_version = draft_version + 1, updated_at = now()
       WHERE id = $1 AND author_id = $2 AND draft_version = $4
       RETURNING id, draft_version, updated_at, published_at, ${STATUS_COLUMNS}`,
      [c.req.param('id'), c.var.user!.id, JSON.stringify(content), body.version],
    );
    if (rows[0]) return c.json({ story: info(rows[0]) });
    const current = await c.var.db.query<{ draft_version: number }>('SELECT draft_version FROM stories WHERE id = $1 AND author_id = $2', [
      c.req.param('id'),
      c.var.user!.id,
    ]);
    if (!current[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    return c.json(
      { error: '다른 곳에서 먼저 저장된 내용이 있습니다. 새로고침해서 최신 내용을 불러오세요', version: current[0].draft_version },
      409,
    );
  })

  // 초안을 공개본으로. 검증 오류가 있으면 공개하지 않는다
  .post('/:id/publish', async (c) => {
    const rows = await c.var.db.query<{ draft: GameContent }>('SELECT draft FROM stories WHERE id = $1 AND author_id = $2', [
      c.req.param('id'),
      c.var.user!.id,
    ]);
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    const errors = validateContent(normalizeContent(rows[0].draft)).filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      return c.json(
        {
          error: `검증 오류 ${errors.length}개를 고쳐야 공개할 수 있습니다`,
          issues: errors.slice(0, 20).map((i) => [i.encounterId, i.where, i.message].filter(Boolean).join(' › ')),
        },
        422,
      );
    }
    const updated = await c.var.db.query<Omit<StoryRow, 'draft'>>(
      `UPDATE stories SET published = draft, published_at = now() WHERE id = $1 AND author_id = $2
       RETURNING id, draft_version, updated_at, published_at, ${STATUS_COLUMNS}`,
      [c.req.param('id'), c.var.user!.id],
    );
    return c.json({ story: info(updated[0]) });
  })

  .post('/:id/unpublish', async (c) => {
    const rows = await c.var.db.query<Omit<StoryRow, 'draft'>>(
      `UPDATE stories SET published = NULL, published_at = NULL WHERE id = $1 AND author_id = $2
       RETURNING id, draft_version, updated_at, published_at, ${STATUS_COLUMNS}`,
      [c.req.param('id'), c.var.user!.id],
    );
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    return c.json({ story: info(rows[0]) });
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    const rows = await c.var.db.query('DELETE FROM stories WHERE id = $1 AND author_id = $2 RETURNING id', [id, c.var.user!.id]);
    if (!rows[0]) return c.json({ error: '이야기를 찾을 수 없습니다' }, 404);
    return c.json({ ok: true });
  });
