import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { User } from '../src/shared/api-types';
import { config } from './config';
import type { Db } from './db';

export type AppEnv = { Variables: { db: Db; user: User | null } };

// ─── 비밀번호 (scrypt) ───

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(key, expected);
}

// ─── 세션 (쿠키에는 무작위 토큰, DB에는 그 해시만) ───

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await c.var.db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expires]);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.secureCookies,
    path: '/',
    expires,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.var.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** 쿠키로 로그인한 사용자를 찾아 c.var.user에 넣는다 (없으면 null) */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  let user: User | null = null;
  if (token) {
    const rows = await c.var.db.query<{ id: string; email: string; display_name: string }>(
      `SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    if (rows[0]) user = { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name };
  }
  c.set('user', user);
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ error: '로그인이 필요합니다' }, 401);
  await next();
};

/** 다른 사이트에서 보낸 쓰기 요청 차단 (SameSite 쿠키에 더한 방어) */
export const checkOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      // 잘못된 Origin
    }
    // 리버스 프록시 뒤라면 원래 Host가 X-Forwarded-Host로 온다
    const host = c.req.header('x-forwarded-host')?.split(',')[0].trim() || c.req.header('host');
    if (originHost !== host) return c.json({ error: '허용되지 않은 요청입니다' }, 403);
  }
  await next();
};

// ─── 로그인 시도 제한 (메모리, 서버 한 대 기준) ───

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLoginBlocked(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() > f.resetAt) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const f = failures.get(key);
  if (!f || Date.now() > f.resetAt) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else f.count++;
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
