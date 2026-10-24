import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import './config'; // .env의 TEST_DATABASE_URL 읽기
import { createDb, type Db } from './db';
import { migrate } from './migrate';

// 실제 PostgreSQL에 대해 API를 검사한다. TEST_DATABASE_URL(.env 또는 환경 변수)이 있을 때만 실행.
// 주의: 그 DB의 데이터는 테스트 시작 때 지워진다 (테스트 전용 DB를 쓰세요).

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('API', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = createDb(url!);
    await migrate(db, () => {});
    await db.query('TRUNCATE users, sessions, stories, saves CASCADE');
    app = createApp(db);
  });
  afterAll(() => db?.close());

  /** 쿠키를 유지하는 간단한 클라이언트 */
  function client() {
    let cookie = '';
    return async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
  }

  const author = client();
  const player = client();
  let storyId = '';

  it('회원가입/로그인/로그아웃', async () => {
    expect((await author('GET', '/api/auth/me')).body.user).toBeNull();
    const signup = await author('POST', '/api/auth/signup', { email: 'Writer@Example.com', password: 'password1', displayName: '작가' });
    expect(signup.status).toBe(201);
    expect(signup.body.user.email).toBe('writer@example.com');
    expect((await author('GET', '/api/auth/me')).body.user.displayName).toBe('작가');

    expect((await player('POST', '/api/auth/signup', { email: 'writer@example.com', password: 'password1', displayName: 'x' })).status).toBe(409);
    expect((await player('POST', '/api/auth/signup', { email: 'p@example.com', password: 'short', displayName: 'x' })).status).toBe(400);
    expect((await player('POST', '/api/auth/signup', { email: 'p@example.com', password: 'password2', displayName: '독자' })).status).toBe(201);
    expect((await player('POST', '/api/auth/logout')).status).toBe(200);
    expect((await player('GET', '/api/auth/me')).body.user).toBeNull();
    expect((await player('POST', '/api/auth/login', { email: 'p@example.com', password: 'wrong-pass' })).status).toBe(401);
    expect((await player('POST', '/api/auth/login', { email: 'P@example.com', password: 'password2' })).status).toBe(200);
  });

  it('로그인 없이는 이야기 API를 쓸 수 없다', async () => {
    expect((await client()('GET', '/api/stories')).status).toBe(401);
    expect((await client()('GET', '/api/my/stories')).status).toBe(401);
  });

  it('제작: 만들기 → 편집 저장 → 버전 충돌', async () => {
    const created = await author('POST', '/api/my/stories', { title: '첫 이야기' });
    expect(created.status).toBe(201);
    storyId = created.body.id;

    const loaded = await author('GET', `/api/my/stories/${storyId}`);
    expect(loaded.body.content.meta.title).toBe('첫 이야기');
    expect(loaded.body.story).toMatchObject({ version: 1, isPublished: false });

    const content = { ...loaded.body.content, meta: { ...loaded.body.content.meta, subtitle: '부제' } };
    const saved = await author('PUT', `/api/my/stories/${storyId}`, { content, version: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body.story.version).toBe(2);
    const stale = await author('PUT', `/api/my/stories/${storyId}`, { content, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.version).toBe(2);

    const list = await author('GET', '/api/my/stories');
    expect(list.body.stories).toMatchObject([{ id: storyId, title: '첫 이야기', subtitle: '부제', encounterCount: 1, isPublished: false }]);
  });

  it('다른 사람의 이야기는 편집할 수 없다', async () => {
    expect((await player('GET', `/api/my/stories/${storyId}`)).status).toBe(404);
    expect((await player('DELETE', `/api/my/stories/${storyId}`)).status).toBe(404);
    expect((await player('POST', `/api/my/stories/${storyId}/publish`)).status).toBe(404);
  });

  it('공개 전에는 목록에 없고, 공개하면 플레이할 수 있다', async () => {
    expect((await player('GET', '/api/stories')).body.stories).toEqual([]);
    expect((await player('GET', `/api/stories/${storyId}`)).status).toBe(404);

    const published = await author('POST', `/api/my/stories/${storyId}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.story).toMatchObject({ isPublished: true, hasUnpublishedChanges: false });

    const list = await player('GET', '/api/stories');
    expect(list.body.stories).toMatchObject([{ id: storyId, title: '첫 이야기', authorName: '작가', hasSave: false }]);
    const play = await player('GET', `/api/stories/${storyId}`);
    expect(play.body.content.encounters).toHaveLength(1);
  });

  it('공개 후 초안을 고치면 공개본은 그대로, "변경 있음" 표시', async () => {
    const loaded = await author('GET', `/api/my/stories/${storyId}`);
    const content = { ...loaded.body.content, meta: { ...loaded.body.content.meta, title: '고친 제목' } };
    const saved = await author('PUT', `/api/my/stories/${storyId}`, { content, version: loaded.body.story.version });
    expect(saved.body.story.hasUnpublishedChanges).toBe(true);
    expect((await player('GET', '/api/stories')).body.stories[0].title).toBe('첫 이야기');
  });

  it('검증 오류가 있으면 공개되지 않는다', async () => {
    const loaded = await author('GET', `/api/my/stories/${storyId}`);
    const broken = structuredClone(loaded.body.content);
    broken.encounters[0].nodes[0].choices[0].branches[0].outcomes[0].next = 'missing_page';
    await author('PUT', `/api/my/stories/${storyId}`, { content: broken, version: loaded.body.story.version });
    const res = await author('POST', `/api/my/stories/${storyId}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.issues.join()).toContain('missing_page');
  });

  it('플레이 저장', async () => {
    expect((await player('GET', `/api/stories/${storyId}/save`)).body.state).toBeNull();
    expect((await player('PUT', `/api/stories/${storyId}/save`, { state: { turn: 3 } })).status).toBe(200);
    expect((await player('GET', `/api/stories/${storyId}/save`)).body.state).toEqual({ turn: 3 });
    expect((await player('GET', '/api/stories')).body.stories[0].hasSave).toBe(true);
    expect((await author('GET', `/api/stories/${storyId}/save`)).body.state).toBeNull();
    await player('DELETE', `/api/stories/${storyId}/save`);
    expect((await player('GET', `/api/stories/${storyId}/save`)).body.state).toBeNull();
  });

  it('비공개로 돌리고 삭제', async () => {
    expect((await author('POST', `/api/my/stories/${storyId}/unpublish`)).body.story.isPublished).toBe(false);
    expect((await player('GET', '/api/stories')).body.stories).toEqual([]);
    expect((await author('DELETE', `/api/my/stories/${storyId}`)).status).toBe(200);
    expect((await author('GET', '/api/my/stories')).body.stories).toEqual([]);
  });

  it('다른 사이트에서 온 쓰기 요청은 막는다', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Host: 'localhost:5173' } });
    expect(res.status).toBe(403);
  });
});
