import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import {
  clearLoginFailures,
  endSession,
  hashPassword,
  isLoginBlocked,
  recordLoginFailure,
  startSession,
  verifyPassword,
  type AppEnv,
} from '../auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(c: Context<AppEnv>): string {
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
}

export const authRoutes = new Hono<AppEnv>()
  .get('/me', (c) => c.json({ user: c.var.user }))

  .post('/signup', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? '').trim();
    if (!EMAIL_RE.test(email)) return c.json({ error: '이메일 형식이 올바르지 않습니다' }, 400);
    if (password.length < 8) return c.json({ error: '비밀번호는 8자 이상이어야 합니다' }, 400);
    if (password.length > 200) return c.json({ error: '비밀번호가 너무 깁니다' }, 400);
    if (!displayName || displayName.length > 30) return c.json({ error: '이름은 1~30자로 정해 주세요' }, 400);

    const hash = await hashPassword(password);
    const rows = await c.var.db.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, displayName, hash],
    );
    if (!rows[0]) return c.json({ error: '이미 가입된 이메일입니다' }, 409);
    await startSession(c, rows[0].id);
    return c.json({ user: { id: rows[0].id, email, displayName } }, 201);
  })

  .post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `${clientIp(c)}|${email}`;
    if (isLoginBlocked(key)) return c.json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요' }, 429);

    const rows = await c.var.db.query<{ id: string; display_name: string; password_hash: string }>(
      'SELECT id, display_name, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      recordLoginFailure(key);
      return c.json({ error: '이메일 또는 비밀번호가 맞지 않습니다' }, 401);
    }
    clearLoginFailures(key);
    await startSession(c, user.id);
    return c.json({ user: { id: user.id, email, displayName: user.display_name } });
  })

  .post('/logout', async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  });
